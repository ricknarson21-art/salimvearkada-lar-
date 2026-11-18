export const ALLOWED_ROOMS = new Set(["genel", "oyun", "muhabbet"]);

export async function authenticateVoiceUser(request, env) {
  const origin = new URL(request.url).origin;
  const requestOrigin = request.headers.get("Origin");
  if (requestOrigin !== origin) {
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  }

  const authHeader = request.headers.get("Authorization") || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) return Response.json({ error: "Login required" }, { status: 401 });

  const userResponse = await fetch("https://bariaxpogmteuxsvbhjo.supabase.co/auth/v1/user", {
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: "Bearer " + accessToken
    }
  });
  if (!userResponse.ok) return Response.json({ error: "Invalid login" }, { status: 401 });
  const user = await userResponse.json();
  if (!user.id) return Response.json({ error: "Invalid user" }, { status: 401 });
  const secret = env.SUPABASE_SECRET_KEY?.trim();
  if (!secret) return Response.json({ error: "Ban kontrolü yapılandırılmamış" }, { status: 503 });
  const banResponse = await fetch(
    "https://bariaxpogmteuxsvbhjo.supabase.co/rest/v1/server_bans?select=user_id&user_id=eq." + encodeURIComponent(user.id) + "&limit=1",
    { headers: { apikey: secret } }
  );
  if (!banResponse.ok) return Response.json({ error: "Ban kontrolü yapılamadı" }, { status: 503 });
  const bans = await banResponse.json();
  if (bans.length) return Response.json({ error: "Bu hesap sunucudan uzaklaştırıldı." }, { status: 403 });
  return user;
}
