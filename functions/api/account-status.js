// Kayıtlı hesaba yönelik ban kontrolü. Her istekte Auth + engelleme listesi doğrulanır.
const SUPABASE_URL="https://bariaxpogmteuxsvbhjo.supabase.co";
const json=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
export async function onRequestGet({request,env}){
  try{
    const bearer=request.headers.get("Authorization")||"";
    const token=bearer.startsWith("Bearer ")?bearer.slice(7).trim():"";
    if(!token||token.length>5000) return json({error:"Giriş gerekli",code:"NO_SESSION"},401);
    const secret=env.SUPABASE_SECRET_KEY?.trim();
    const publishable=env.SUPABASE_PUBLISHABLE_KEY?.trim();
    if(!secret||!publishable) return json({error:"Sunucu ayarı eksik"},500);
    const auth=await fetch(SUPABASE_URL+"/auth/v1/user",{
      headers:{apikey:publishable,Authorization:"Bearer "+token}
    });
    if(!auth.ok) return json({error:"Oturum geçersiz",code:"NO_SESSION"},401);
    const user=await auth.json();
    if(user?.is_anonymous===true) return json({error:"Kayıtlı hesap gerekli",code:"NO_SESSION"},401);
    if(!user?.id) return json({error:"Oturum geçersiz",code:"NO_SESSION"},401);
    const res=await fetch(SUPABASE_URL+"/rest/v1/server_bans?select=status&user_id=eq."+encodeURIComponent(user.id)+"&limit=1",{
      headers:{apikey:secret}
    });
    if(!res.ok) return json({error:"Ban kontrolü başarısız"},503);
    const bans=await res.json();
    if(bans.length) return json({error:"Hesabın sunucudan uzaklaştırıldı.",code:"ACCOUNT_BANNED"},403);
    return json({allowed:true});
  }catch(error){console.error("Oturum kontrol hatası",error);return json({error:"Kontrol başarısız"},503);}
}
