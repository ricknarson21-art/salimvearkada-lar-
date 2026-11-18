
export async function onRequestPost() {
  return Response.json(
    { error: "Kayıt sistemi henüz hazırlanıyor." },
    { status: 503 }
  );
}

const SUPABASE_URL = "https://bariaxpogmteuxsvbhjo.supabase.co";

const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });

function validUsername(value) {
  return typeof value === "string" &&
    /^[a-zA-Z0-9_]{3,20}$/.test(value);
}

export async function onRequestPost({ request, env }) {
  try {
    // Yalnızca kendi sitemizden gelen istekleri kabul et.
    const origin = new URL(request.url).origin;

    if (request.headers.get("Origin") !== origin) {
      return json({ error: "Geçersiz istek." }, 403);
    }

    const body = await request.json().catch(() => null);

    const username = body?.username?.trim();
    const password = body?.password;

    if (!validUsername(username)) {
      return json({
        error: "Kullanıcı adı 3-20 karakter olmalı. Harf, rakam ve alt çizgi kullanabilirsin."
      }, 400);
    }

    if (
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 128
    ) {
      return json({
        error: "Şifre 12-128 karakter olmalı."
      }, 400);
    }

    if (!env.SUPABASE_SECRET_KEY) {
      return json({ error: "Sunucu yapılandırması eksik." }, 500);
    }

    // Kullanıcı adını Auth tarafından kullanılacak
    // dahili bir e-posta kimliğine dönüştürür.
    // Kullanıcıdan gerçek e-posta istenmez.
    const internalEmail =
      username.toLowerCase() + "@accounts.birartibir.invalid";

    const headers = {
      apikey: env.SUPABASE_SECRET_KEY,
      Authorization: "Bearer " + env.SUPABASE_SECRET_KEY,
      "Content-Type": "application/json"
    };

    // Kullanıcıyı Supabase Auth üzerinde oluştur.
    const authResponse = await fetch(
      SUPABASE_URL + "/auth/v1/admin/users",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: internalEmail,
          password,
          email_confirm: true,
          app_metadata: { account_type: "registered" }
        })
      }
    );

    const authData = await authResponse.json();

    if (!authResponse.ok) {
      return json({
        error: "Bu kullanıcı adı kullanılıyor veya hesap oluşturulamadı."
      }, 409);
    }

    const userId = authData.id;

    // Kullanıcı adını kayıtlı hesaplar tablosuna ekle.
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
      // Kısmi hesap oluşmasını önlemek için geri al.
      await fetch(
        SUPABASE_URL + "/auth/v1/admin/users/" + userId,
        { method: "DELETE", headers }
      );

      return json({
        error: "Kullanıcı adı kaydedilemedi."
      }, 500);
    }

    // Yeni hesap varsayılan olarak normal üyedir.
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
      await fetch(
        SUPABASE_URL + "/auth/v1/admin/users/" + userId,
        { method: "DELETE", headers }
      );

      return json({ error: "Hesap yetkisi oluşturulamadı." }, 500);
    }

    return json({
      success: true,
      message: "Hesap oluşturuldu."
    }, 201);

  } catch (error) {
    console.error("Register error:", error);
    return json({ error: "Kayıt işlemi başarısız." }, 500);
  }
}
