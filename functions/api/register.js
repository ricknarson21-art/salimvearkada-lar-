
const SUPABASE_URL = "https://bariaxpogmteuxsvbhjo.supabase.co";

function reply(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

async function verifyTurnstile(token, request, secret) {
  if (!token || !secret) return false;

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);

  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body: form }
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

    if (!env.SUPABASE_SECRET_KEY ||
        !env.TURNSTILE_SECRET_KEY) {
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
      password.length < 12 ||
      password.length > 128
    ) {
      return reply({
        error: "Kullanıcı adı 3-20 karakter, şifre 12-128 karakter olmalı."
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

    const internalEmail =
      username.toLowerCase() +
      "@accounts.birartibir.invalid";

    const headers = {
      apikey: env.SUPABASE_SECRET_KEY,
      Authorization: "Bearer " + env.SUPABASE_SECRET_KEY,
      "Content-Type": "application/json"
    };

    const authResponse = await fetch(
      SUPABASE_URL + "/auth/v1/admin/users",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: internalEmail,
          password,
          email_confirm: true,
          app_metadata: {
            account_type: "registered"
          }
        })
      }
    );

    const authData = await authResponse.json().catch(() => ({}));

    if (!authResponse.ok || !authData.id) {
      return reply({
        error: "Bu kullanıcı adı kullanılıyor veya kayıt oluşturulamadı."
      }, 409);
    }

    const userId = authData.id;

    async function rollback() {
      const response = await fetch(
        SUPABASE_URL + "/auth/v1/admin/users/" +
          encodeURIComponent(userId),
        { method: "DELETE", headers }
      );

      if (!response.ok) {
        console.error("Account rollback failed:", response.status);
      }
    }

    const profileResponse = await fetch(
      SUPABASE_URL + "/rest/v1/registered_accounts",
      {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          user_id: userId,
          username
        })
      }
    );

    if (!profileResponse.ok) {
      await rollback();
      return reply({
        error: "Kullanıcı hesabı tamamlanamadı."
      }, 500);
    }

    const roleResponse = await fetch(
      SUPABASE_URL + "/rest/v1/account_roles",
      {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          user_id: userId,
          role: "member"
        })
      }
    );

    if (!roleResponse.ok) {
      await rollback();
      return reply({
        error: "Hesap yetkisi oluşturulamadı."
      }, 500);
    }

    return reply({
      success: true,
      message: "Hesap oluşturuldu."
    }, 201);

  } catch (error) {
    console.error("Registration error:", error);

    return reply({
      error: "Kayıt işlemi başarısız."
    }, 500);
  }
}
