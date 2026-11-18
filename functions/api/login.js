const SUPABASE_URL = "https://bariaxpogmteuxsvbhjo.supabase.co";

function reply(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

async function verifyTurnstile(token, request, secret) {
  if (typeof token !== "string" || !token || !secret) {
    return false;
  }

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);

  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: form
    }
  );

  if (!response.ok) return false;

  const result = await response.json();

  return result.success === true &&
    result.hostname === "birartibir.online";
}

export async function onRequestPost({ request, env }) {
  try {
    const origin = new URL(request.url).origin;

    if (request.headers.get("Origin") !== origin) {
      return reply({ error: "Geçersiz istek." }, 403);
    }

    if (
      !env.SUPABASE_PUBLISHABLE_KEY ||
      !env.TURNSTILE_SECRET_KEY
    ) {
      return reply({
        error: "Sunucu yapılandırması eksik."
      }, 500);
    }

    const body = await request.json().catch(() => null);

    const username = body?.username?.trim();
    const password = body?.password;
    const turnstileToken = body?.turnstileToken;

    if (
      typeof username !== "string" ||
      !/^[a-zA-Z0-9_]{3,20}$/.test(username) ||
      typeof password !== "string" ||
      password.length < 1 ||
      password.length > 128
    ) {
      return reply({
        error: "Kullanıcı adı veya şifre geçersiz."
      }, 400);
    }

    const verified = await verifyTurnstile(
      turnstileToken,
      request,
      env.TURNSTILE_SECRET_KEY
    );

    if (!verified) {
      return reply({
        error: "Güvenlik doğrulaması başarısız."
      }, 403);
    }

    // Kullanıcı adından dahili giriş kimliği oluşturulur.
    const internalEmail =
  username.toLowerCase() +
  "@accounts.birartibir.online";

    // Şifreyi yalnızca Supabase Auth doğrular.
    const response = await fetch(
      SUPABASE_URL + "/auth/v1/token?grant_type=password",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: env.SUPABASE_PUBLISHABLE_KEY
        },
        body: JSON.stringify({
          email: internalEmail,
          password
        })
      }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.access_token) {
      return reply({
        error: "Kullanıcı adı veya şifre yanlış."
      }, 401);
    }

    return reply({
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      expires_in: result.expires_in,
      token_type: result.token_type,
      user: {
        id: result.user?.id,
        username
      }
    });

  } catch (error) {
    console.error("Login error:", error);

    return reply({
      error: "Giriş işlemi başarısız."
    }, 500);
  }
}
