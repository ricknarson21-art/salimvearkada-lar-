import { authenticateVoiceUser } from "./_voice-auth.js";

export async function onRequestPost({ request, env }) {
  try {
    const user = await authenticateVoiceUser(request, env);
    if (user instanceof Response) return user;
    const response = await fetch(
      "https://bariaxpogmteuxsvbhjo.supabase.co/rest/v1/registered_accounts?select=user_id,username&order=username.asc",
      { cache:"no-store", headers:{apikey:env.SUPABASE_SECRET_KEY.trim()} }
    );
    if (!response.ok) throw new Error("Kayıtlı üyeler okunamadı.");
    return Response.json({members:await response.json()},{headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    console.error("Registered members:",error);
    return Response.json({error:"Üye listesi okunamadı."},{status:502});
  }
}
