import { clearTimedMute, extendTimedMute, isTimedMutePermission, muteExpiry, setTimedMutePermission } from "./_timed-mute.js";
// Bir Artı Bir - Cloudflare Pages Functions. Bu dosya SUNUCUDA çalışır.
// Yetki, istemciden gelen role/username'a değil Supabase Auth user.id ve account_roles'a dayanır.
const SUPABASE_URL = "https://bariaxpogmteuxsvbhjo.supabase.co";
const ROOMS = new Set(["genel", "oyun", "muhabbet"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encode = new TextEncoder();
const reply = (data, status = 200) => Response.json(data, {status, headers:{"Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"}});

function settings(env) {
  const secret = env.SUPABASE_SECRET_KEY?.trim();
  const publishable = env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!secret || !publishable) throw new Error("Supabase sunucu değişkenleri eksik");
  return {secret, publishable};
}
function adminHeaders(secret, extra = {}) {
  // Supabase sb_secret_* değeri Authorization: Bearer'a konmaz.
  return {apikey:secret, "Content-Type":"application/json", ...extra};
}
async function dbCall(secret, table, query, method = "GET", body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method, cache:"no-store", headers:adminHeaders(secret, method === "PATCH" ? {Prefer:"return=representation"} : {}),
    ...(body === undefined ? {} : {body:JSON.stringify(body)})
  });
  if (!res.ok) {
    console.error("Moderasyon veritabanı hatası", table, method, res.status);
    throw new Error("Veritabanı isteği reddedildi. SQL izinlerini kontrol et.");
  }
  if (res.status === 204 || res.status === 205) return null;
  return res.json().catch(() => null);
}
async function authAdmin(secret, method, id, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method,
    headers:adminHeaders(secret),
    ...(body===undefined ? {} : {body:JSON.stringify(body)})
  });
  if(!res.ok){
    console.error("Auth yönetim hatası",method,res.status);
    throw new Error("Supabase hesap işlemi reddedildi ("+res.status+")");
  }
  return res.json().catch(()=>null);
}
async function bannedRecord(secret, userId) {
  const rows=await dbCall(secret,"server_bans",`?select=user_id,status&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  return rows?.[0] || null;
}
async function upsertBan(secret, id, username, status, actor) {
  const url=`${SUPABASE_URL}/rest/v1/server_bans?on_conflict=user_id`;
  const res=await fetch(url,{
    method:"POST",headers:adminHeaders(secret,{Prefer:"resolution=merge-duplicates,return=minimal"}),
    body:JSON.stringify({user_id:id, username, status, actor_user_id:actor, created_at:new Date().toISOString()})
  });
  if(!res.ok){console.error("Ban kaydı eklenemedi",res.status);throw new Error("Ban veritabanı güncellenemedi");}
}
async function removeBan(secret,id){
  await dbCall(secret,"server_bans",`?user_id=eq.${encodeURIComponent(id)}`,"DELETE");
}
async function removeFromAllVoiceRooms(env,id){
  const failed=[];
  for(const room of ROOMS){
    try{
      const current=await roomCall(env,"ListParticipants",room,{room});
      if((current.participants||[]).some(p=>p.identity===id)){
        await roomCall(env,"RemoveParticipant",room,{room,identity:id});
      }
    }catch(error){
      // Oda henüz oluşturulmamış olabilir. Ban veritabanı işlemine dokunma.
      console.warn("Ban sırasında ses odası kontrol edilemedi",room,error?.message);
      failed.push(room);
    }
  }
  return failed;
}
async function identify(request, env) {
  const bearer = request.headers.get("Authorization") || "";
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";
  if (!token || token.length > 5000) return null;
  const {publishable} = settings(env);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers:{apikey:publishable, Authorization:`Bearer ${token}`}
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user && user.is_anonymous !== true && UUID.test(user.id) ? user : null;
}
async function roleOf(secret, userId) {
  const result = await dbCall(secret,"account_roles",`?select=role&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  return ["owner","admin"].includes(result?.[0]?.role) ? result[0].role : "member";
}
function higher(actorRole, targetRole) {
  return (actorRole === "owner" && targetRole !== "owner") || (actorRole === "admin" && targetRole === "member");
}
function base64url(bytes) {
  let chars=""; for (const byte of bytes) chars += String.fromCharCode(byte);
  return btoa(chars).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function livekitJWT(env, room, destinationRoom) {
  const now = Math.floor(Date.now()/1000);
  const payload = {iss:env.LIVEKIT_API_KEY.trim(),iat:now,nbf:now,exp:now+120,
    video:{roomAdmin:true,room,...(destinationRoom ? {destinationRoom} : {})}};
  const head = base64url(encode.encode(JSON.stringify({alg:"HS256",typ:"JWT"})));
  const body = base64url(encode.encode(JSON.stringify(payload)));
  const message = `${head}.${body}`;
  const key = await crypto.subtle.importKey("raw",encode.encode(env.LIVEKIT_API_SECRET.trim()),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig = await crypto.subtle.sign("HMAC",key,encode.encode(message));
  return `${message}.${base64url(new Uint8Array(sig))}`;
}
async function roomCall(env, method, room, payload, destinationRoom) {
  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
    throw new Error("LiveKit sunucu değişkenleri eksik");
  }
  const base = new URL(env.LIVEKIT_URL.trim());
  if (!["https:","wss:"].includes(base.protocol)) throw new Error("LiveKit adresi HTTPS/WSS olmalı");
  base.protocol="https:";
  base.pathname=`/twirp/livekit.RoomService/${method}`;
  base.search=""; base.hash="";
  const jwt = await livekitJWT(env,room,destinationRoom);
  const res = await fetch(base.toString(),{
    method:"POST", headers:{Authorization:`Bearer ${jwt}`,"Content-Type":"application/json"},
    body:JSON.stringify(payload)
  });
  if(!res.ok){
    console.error("LiveKit moderasyon isteği reddedildi",method,res.status);
    if(res.status===404) throw new Error("Katılımcı veya oda bulunamadı");
    if(method==="MoveParticipant" && (res.status===400||res.status===501))
      throw new Error("Odaya taşıma mevcut LiveKit sunucusunda desteklenmiyor");
    throw new Error("LiveKit işlemi başarısız oldu ("+res.status+")");
  }
  return res.json().catch(()=>({}));
}
async function handler(request, env, isPost) {
  try {
    if(isPost && request.headers.get("Origin") !== new URL(request.url).origin)
      return reply({error:"Geçersiz istek kökeni"},403);
    const user = await identify(request,env);
    if(!user) return reply({error:"Giriş yapmalısın"},401);
    const {secret} = settings(env);
    const role = await roleOf(secret,user.id);
    if(await bannedRecord(secret,user.id)) {
      return reply({error:"Bu hesap sunucudan uzaklaştırıldı.",code:"ACCOUNT_BANNED"},403);
    }
    if(!isPost) {
      if(role === "member") return reply({role});
      const [accounts,roles,bans] = await Promise.all([
        dbCall(secret,"registered_accounts","?select=user_id,username&order=username.asc&limit=500"),
        dbCall(secret,"account_roles","?select=user_id,role&limit=500"),
        dbCall(secret,"server_bans","?select=user_id,status&limit=1000")
      ]);
      const roleMap = new Map((roles||[]).map(r=>[r.user_id,r.role]));
      const banMap = new Map((bans||[]).map(r=>[r.user_id,r.status]));
      return reply({role, accounts:(accounts||[]).map(a=>({
        user_id:a.user_id,username:a.username,role:roleMap.get(a.user_id)||"member",
        banned:banMap.get(a.user_id)==="banned"
      }))});
    }
    if(role === "member") return reply({error:"Bu işlem için admin veya kurucu yetkisi gerekiyor"},403);
    const data=await request.json().catch(()=>null);
    if(!data || typeof data!=="object" || typeof data.action!=="string") return reply({error:"Geçersiz istek"},400);

    if(data.action==="clear_chat") {
      // Bu işlem kalıcı olarak tüm mesajları siler; istemci önceden onay ister.
      await dbCall(secret,"messages","?id=not.is.null","DELETE");
      return reply({success:true,message:"Sohbet temizlendi"});
    }
    const targetUserId = data.targetUserId;
    if(typeof targetUserId!=="string" || !UUID.test(targetUserId)) return reply({error:"Geçersiz kullanıcı kimliği"},400);
    if(targetUserId===user.id) return reply({error:"Kendine bu işlemi uygulayamazsın"},403);
    const targetRole = await roleOf(secret,targetUserId);
    if(!higher(role,targetRole)) return reply({error:"Bu kullanıcının yetki seviyesi korunuyor"},403);

    if(["ban_user","unban_user","delete_account"].includes(data.action)) {
      // Bütün hesap düzeyi ve geri alınamaz işlemler sadece kurucuya açık.
      if(role!=="owner") return reply({error:"Bu işlemi yalnızca kurucu yapabilir"},403);
      const accounts=await dbCall(secret,"registered_accounts",`?select=user_id,username&user_id=eq.${encodeURIComponent(targetUserId)}&limit=1`);
      const target=accounts?.[0];
      if(!target) return reply({error:"Kayıtlı hesap bulunamadı"},404);
      const currentBan=await bannedRecord(secret,targetUserId);
      if(data.action==="ban_user") {
        if(currentBan) return reply({success:true,message:"Hesap zaten yasaklı"});
        await upsertBan(secret,targetUserId,target.username,"banned",user.id);
        try{
          await authAdmin(secret,"PUT",targetUserId,{ban_duration:"876000h"});
        }catch(error){
          // Auth güncellenemezse tabloyu eski haline döndür.
          await removeBan(secret,targetUserId).catch(e=>console.error("Ban rollback",e));
          throw error;
        }
        const failed=await removeFromAllVoiceRooms(env,targetUserId);
        return reply({success:true,message:failed.length
          ?"Hesap banlandı. Bazı açık ses odaları kontrol edilemedi."
          :"Hesap banlandı ve ses odalarından çıkarıldı."});
      }
      if(data.action==="unban_user") {
        if(!currentBan || currentBan.status!=="banned") return reply({error:"Bu hesap banlı değil"},409);
        await authAdmin(secret,"PUT",targetUserId,{ban_duration:"none"});
        await removeBan(secret,targetUserId);
        return reply({success:true,message:"Hesabın banı kaldırıldı"});
      }
      // Silme işlemi için tarayıcıdan doğrulanan isim sunucuda da denetlenir.
      if(data.confirmUsername!==target.username) return reply({error:"Silme onayı kullanıcı adıyla eşleşmiyor"},400);
      await upsertBan(secret,targetUserId,target.username,"deleted",user.id);
      await removeFromAllVoiceRooms(env,targetUserId);
      try{
        await authAdmin(secret,"DELETE",targetUserId,{should_soft_delete:false});
      }catch(error){
        // FK engeli oluşursa erişim kapalı kalsın ve kullanıcı yönetim listesinde görünsün.
        await upsertBan(secret,targetUserId,target.username,"banned",user.id);
        return reply({error:"Hesap silinemedi; güvenlik için banlı bırakıldı. İlişkili tablolar veya Auth izinleri kontrol edilmeli."},502);
      }
      // Bazı kurulumlarda bu kayıtlar FK ile kendiliğinden silinir; kalanları temizle.
      const relation=["messages","profiles","account_roles","registered_accounts"];
      const unclean=[];
      for(const table of relation){
        try{await dbCall(secret,table,`?user_id=eq.${encodeURIComponent(targetUserId)}`,"DELETE");}
        catch(error){unclean.push(table);console.error("Hesap silme temizliği",table,error);}
      }
      return reply({success:true,message:unclean.length
        ?"Hesap silindi; bazı ilişkili kayıtlar temizlenemedi: "+unclean.join(", ")
        :"Hesap kalıcı olarak silindi."});
    }
    if(data.action==="set_role") {
      if(role!=="owner") return reply({error:"Admin atamasını yalnızca kurucu yapabilir"},403);
      if(!["admin","member"].includes(data.newRole)) return reply({error:"Geçersiz yetki"},400);
      const accounts=await dbCall(secret,"registered_accounts",`?select=user_id&user_id=eq.${encodeURIComponent(targetUserId)}&limit=1`);
      if(!accounts?.length) return reply({error:"Yalnızca kayıtlı üyeye admin yetkisi verilebilir"},404);
      if(await bannedRecord(secret,targetUserId)) return reply({error:"Banlı hesabın yetkisi değiştirilemez"},409);
      const changed=await dbCall(secret,"account_roles",`?user_id=eq.${encodeURIComponent(targetUserId)}`,"PATCH",{role:data.newRole});
      if(!Array.isArray(changed)||changed.length!==1) return reply({error:"Yetki kaydı güncellenemedi"},409);
      return reply({success:true,message:data.newRole==="admin"?"Admin yetkisi verildi":"Admin yetkisi kaldırıldı"});
    }
    if(!["kick","move","mute","mute_timed","unmute"].includes(data.action)) return reply({error:"Bilinmeyen işlem"},400);
    if(!ROOMS.has(data.room)) return reply({error:"Geçersiz oda"},400);
    if(data.action==="move" && (!ROOMS.has(data.destinationRoom)||data.destinationRoom===data.room))
      return reply({error:"Geçerli farklı bir hedef oda seç"},400);
    const current = await roomCall(env,"ListParticipants",data.room,{room:data.room});
    const person=(current.participants||[]).find(p=>p.identity===targetUserId);
    if(!person) return reply({error:"Kullanıcı artık bu odada değil"},404);
    if(data.action==="kick") {
      await roomCall(env,"RemoveParticipant",data.room,{room:data.room,identity:targetUserId});
      return reply({success:true,message:"Kullanıcı odadan çıkarıldı"});
    }
    if(data.action==="move") {
      await roomCall(env,"MoveParticipant",data.room,{room:data.room,identity:targetUserId,destination_room:data.destinationRoom},data.destinationRoom);
      return reply({success:true,message:"Kullanıcı diğer odaya taşındı"});
    }
    if(data.action==="unmute") {
      await clearTimedMute(env,targetUserId);
      if(isTimedMutePermission(person.permission) && await muteExpiry(env,targetUserId)<=Date.now()) {
        await setTimedMutePermission(roomCall,env,data.room,person,false);
        if(await muteExpiry(env,targetUserId)>Date.now()){
          await setTimedMutePermission(roomCall,env,data.room,person,true);
        }
      }
      return reply({success:true,message:"Susturma kaldırıldı. Kullanıcı mikrofonunu açabilir."});
    }
    if(data.action==="mute_timed") {
      if(![30,120].includes(data.seconds)) return reply({error:"Geçersiz susturma süresi"},400);
      await extendTimedMute(env,targetUserId,data.seconds);
      await setTimedMutePermission(roomCall,env,data.room,person,true);
      return reply({success:true,message:data.seconds===30 ? "Mikrofon 30 saniyeliğine susturuldu"
        : "Mikrofon 2 dakikalığına susturuldu"});
    }
    // Sadece mikrofon/ses yayınını sustur. Sunucu istemciyi uzaktan zorla unmute etmez.
    const tracks=(person.tracks||[]).filter(t=>{
      const source=String(t.source ?? "").toUpperCase();
      const type=String(t.type ?? "").toUpperCase();
      return source.includes("MICROPHONE") || source==="2" || (!source && (type.includes("AUDIO")||type==="0"));
    });
    if(!tracks.length || tracks.every(t=>t.muted)) return reply({success:true,message:"Kişinin mikrofonu zaten kapalı"});
    for(const track of tracks.filter(t=>!t.muted)) {
      if(!track.sid) continue;
      await roomCall(env,"MutePublishedTrack",data.room,{room:data.room,identity:targetUserId,track_sid:track.sid,muted:true});
    }
    return reply({success:true,message:"Mikrofon susturuldu"});
  } catch (error) {
    console.error("Moderasyon isteği başarısız",error);
    return reply({error:"İşlem başarısız: "+(error instanceof Error ? error.message : "Sunucu hatası")},500);
  }
}
export const onRequestGet = ({request,env})=>handler(request,env,false);
export const onRequestPost = ({request,env})=>handler(request,env,true);

// Müzik komutları da aynı LiveKit oda yetkisini kullanır.
export { roleOf, roomCall };
