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
    method, headers:adminHeaders(secret, method === "PATCH" ? {Prefer:"return=representation"} : {}),
    ...(body === undefined ? {} : {body:JSON.stringify(body)})
  });
  if (!res.ok) {
    console.error("Moderasyon veritabanı hatası", table, method, res.status);
    throw new Error("Veritabanı isteği reddedildi. SQL izinlerini kontrol et.");
  }
  if (res.status === 204 || res.status === 205) return null;
  return res.json().catch(() => null);
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
  return user && UUID.test(user.id) ? user : null;
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
    if(!isPost) {
      if(role === "member") return reply({role});
      const [accounts,roles] = await Promise.all([
        dbCall(secret,"registered_accounts","?select=user_id,username&order=username.asc&limit=500"),
        dbCall(secret,"account_roles","?select=user_id,role&limit=500")
      ]);
      const roleMap = new Map((roles||[]).map(r=>[r.user_id,r.role]));
      return reply({role, accounts:(accounts||[]).map(a=>({user_id:a.user_id,username:a.username,role:roleMap.get(a.user_id)||"member"}))});
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

    if(data.action==="set_role") {
      if(role!=="owner") return reply({error:"Admin atamasını yalnızca kurucu yapabilir"},403);
      if(!["admin","member"].includes(data.newRole)) return reply({error:"Geçersiz yetki"},400);
      const accounts=await dbCall(secret,"registered_accounts",`?select=user_id&user_id=eq.${encodeURIComponent(targetUserId)}&limit=1`);
      if(!accounts?.length) return reply({error:"Yalnızca kayıtlı üyeye admin yetkisi verilebilir"},404);
      const changed=await dbCall(secret,"account_roles",`?user_id=eq.${encodeURIComponent(targetUserId)}`,"PATCH",{role:data.newRole});
      if(!Array.isArray(changed)||changed.length!==1) return reply({error:"Yetki kaydı güncellenemedi"},409);
      return reply({success:true,message:data.newRole==="admin"?"Admin yetkisi verildi":"Admin yetkisi kaldırıldı"});
    }
    if(!["kick","move","mute"].includes(data.action)) return reply({error:"Bilinmeyen işlem"},400);
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
