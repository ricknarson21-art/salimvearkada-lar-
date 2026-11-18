
const SUPABASE_URL = "https://bariaxpogmteuxsvbhjo.supabase.co";

function reply(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const origin = new URL(request.url).origin;

    if (request.headers.get("Origin") !== origin) {
      return reply({ error: "Geçersiz istek." }, 403);
    }

    const body = await request.json().catch(() => null);
    const username = body?.username?.trim();
    const password = body?.password;

    if (
      typeof username !== "string" ||
      !/^[a-zA-Z0-9_]{3,20}$/.test(username) ||
      typeof password !== "string" ||
      password.length < 1
    ) {
      return reply({
        error: "Kullanıcı adı veya şifre geçersiz."
      }, 400);
    }

    if (!env.SUPABASE_PUBLISHABLE_KEY) {
      return reply({
        error: "Sunucu yapılandırması eksik."
      }, 500);
    }

    // Kayıtlı hesapların dahili kimliği.
    // Kullanıcıdan e-posta istenmez.
    const internalEmail =
      username.toLowerCase() + "@accounts.birartibir.invalid";

    // Şifre doğrulamasını Supabase Auth yapar.
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
