
const SUPABASE_URL = "https://bariaxpogmteuxsvbhjo.supabase.co";
const INTERNAL_DOMAIN = "accounts.birartibir.online";

const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });

async function captcha(token, request, secret) {
  if (typeof token !== "string" || !token || !secret) {
    return false;
  }

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);

  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.set("remoteip", ip);

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body: form }
  );

  if (!response.ok) return false;

  const data = await response.json();

  return data.success === true &&
    data.hostname === "birartibir.online";
}

export async function onRequestPost({ request, env }) {
  try {
    if (
      new URL(request.url).origin !==
      request.headers.get("Origin")
    ) {
      return json({ error: "Geçersiz istek." }, 403);
    }

    if (
      !env.SUPABASE_SECRET_KEY ||
      !env.TURNSTILE_SECRET_KEY
    ) {
      return json({ error: "Sunucu ayarları eksik." }, 500);
    }

    const body = await request.json().catch(() => null);

    const username =
      typeof body?.username === "string"
        ? body.username.trim()
        : "";

    const password = body?.password;

    if (
      !/^[a-zA-Z0-9_]{3,20}$/.test(username) ||
      typeof password !== "string" ||
      password.length < 6 ||
      password.length > 128
    ) {
      return json({
        error: "Kullanıcı adı 3–20, şifre 6–128 karakter olmalı."
      }, 400);
    }

    if (
      !await captcha(
        body?.turnstileToken,
        request,
        env.TURNSTILE_SECRET_KEY
      )
    ) {
      return json({
        error: "Güvenlik doğrulaması başarısız."
      }, 403);
    }

    const headers = {
      apikey: env.SUPABASE_SECRET_KEY,
      Authorization: "Bearer " + env.SUPABASE_SECRET_KEY,
      "Content-Type": "application/json"
    };

    const email =
      username.toLowerCase() + "@" + INTERNAL_DOMAIN;

    const authResponse = await fetch(
      SUPABASE_URL + "/auth/v1/admin/users",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          app_metadata: {
            account_type: "registered"
          }
        })
      }
    );

    const authData = await authResponse.json()
      .catch(() => ({}));

    if (!authResponse.ok || !authData.id) {
      console.error(
        "Auth create failed",
        authResponse.status,
        authData?.code || authData?.error_code || ""
      );

      return json({
        error: authResponse.status === 422
          ? "Bu kullanıcı adı kullanılıyor veya adres kabul edilmedi."
          : "Hesap oluşturulamadı; sunucu ayarları kontrol edilmeli."
      }, authResponse.status === 422 ? 409 : 502);
    }

    const userId = authData.id;

    const rollback = async () => {
      const r = await fetch(
        SUPABASE_URL +
          "/auth/v1/admin/users/" +
          encodeURIComponent(userId),
        {
          method: "DELETE",
          headers
        }
      );

      if (!r.ok) {
        console.error("Rollback failed", r.status);
      }
    };

    const profile = await fetch(
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

    if (!profile.ok) {
      console.error(
        "registered_accounts insert failed",
        profile.status
      );

      await rollback();

      return json({
        error: "Kayıt tamamlanamadı."
      }, 500);
    }

    const role = await fetch(
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

    if (!role.ok) {
      console.error(
        "account_roles insert failed",
        role.status
      );

      await rollback();

      return json({
        error: "Yetki kaydı tamamlanamadı."
      }, 500);
    }

    return json({
      success: true,
      message: "Hesap oluşturuldu."
    }, 201);

  } catch (error) {
    console.error("Registration error", error);

    return json({
      error: "Kayıt işlemi başarısız."
    }, 500);
  }
}

const SUPABASE_URL = "https://bariaxpogmteuxsvbhjo.supabase.co";
const INTERNAL_DOMAIN = "accounts.birartibir.online";

const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });

async function captcha(token, request, secret) {
  if (typeof token !== "string" || !token || !secret) {
    return false;
  }

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);

  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.set("remoteip", ip);

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body: form }
  );

  if (!response.ok) return false;

  const data = await response.json();

  return data.success === true &&
    data.hostname === "birartibir.online";
}

export async function onRequestPost({ request, env }) {
  try {
    if (
      new URL(request.url).origin !==
      request.headers.get("Origin")
    ) {
      return json({ error: "Geçersiz istek." }, 403);
    }

    if (
      !env.SUPABASE_SECRET_KEY ||
      !env.TURNSTILE_SECRET_KEY
    ) {
      return json({ error: "Sunucu ayarları eksik." }, 500);
    }

    const body = await request.json().catch(() => null);

    const username =
      typeof body?.username === "string"
        ? body.username.trim()
        : "";

    const password = body?.password;

    if (
      !/^[a-zA-Z0-9_]{3,20}$/.test(username) ||
      typeof password !== "string" ||
      password.length < 6 ||
      password.length > 128
    ) {
      return json({
        error: "Kullanıcı adı 3–20, şifre 6–128 karakter olmalı."
      }, 400);
    }

    if (
      !await captcha(
        body?.turnstileToken,
        request,
        env.TURNSTILE_SECRET_KEY
      )
    ) {
      return json({
        error: "Güvenlik doğrulaması başarısız."
      }, 403);
    }

    const headers = {
      apikey: env.SUPABASE_SECRET_KEY,
      Authorization: "Bearer " + env.SUPABASE_SECRET_KEY,
      "Content-Type": "application/json"
    };

    const email =
      username.toLowerCase() + "@" + INTERNAL_DOMAIN;

    const authResponse = await fetch(
      SUPABASE_URL + "/auth/v1/admin/users",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          app_metadata: {
            account_type: "registered"
          }
        })
      }
    );

    const authData = await authResponse.json()
      .catch(() => ({}));

    if (!authResponse.ok || !authData.id) {
      console.error(
        "Auth create failed",
        authResponse.status,
        authData?.code || authData?.error_code || ""
      );

      return json({
        error: authResponse.status === 422
          ? "Bu kullanıcı adı kullanılıyor veya adres kabul edilmedi."
          : "Hesap oluşturulamadı; sunucu ayarları kontrol edilmeli."
      }, authResponse.status === 422 ? 409 : 502);
    }

    const userId = authData.id;

    const rollback = async () => {
      const r = await fetch(
        SUPABASE_URL +
          "/auth/v1/admin/users/" +
          encodeURIComponent(userId),
        {
          method: "DELETE",
          headers
        }
      );

      if (!r.ok) {
        console.error("Rollback failed", r.status);
      }
    };

    const profile = await fetch(
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

    if (!profile.ok) {
      console.error(
        "registered_accounts insert failed",
        profile.status
      );

      await rollback();

      return json({
        error: "Kayıt tamamlanamadı."
      }, 500);
    }

    const role = await fetch(
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

    if (!role.ok) {
      console.error(
        "account_roles insert failed",
        role.status
      );

      await rollback();

      return json({
        error: "Yetki kaydı tamamlanamadı."
      }, 500);
    }

    return json({
      success: true,
      message: "Hesap oluşturuldu."
    }, 201);

  } catch (error) {
    console.error("Registration error", error);

    return json({
      error: "Kayıt işlemi başarısız."
    }, 500);
  }
}
