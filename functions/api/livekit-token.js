
const encoder = new TextEncoder();

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function signJWT(payload, apiKey, apiSecret) {
  const header = { alg: "HS256", typ: "JWT" };

  const encode = (obj) =>
    base64url(encoder.encode(JSON.stringify(obj)));

  const message = encode(header) + "." + encode(payload);

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message)
  );

  return message + "." + base64url(new Uint8Array(signature));
}

export async function onRequestPost({ request, env }) {
  try {
    const origin = new URL(request.url).origin;

    if (request.headers.get("Origin") !== origin) {
      return Response.json({ error: "Invalid origin" }, { status: 403 });
    }

    const authHeader = request.headers.get("Authorization") || "";
    const accessToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (!accessToken) {
      return Response.json({ error: "Login required" }, { status: 401 });
    }

    const userResponse = await fetch(
      "https://bariaxpogmteuxsvbhjo.supabase.co/auth/v1/user",
      {
        headers: {
          apikey: env.SUPABASE_PUBLISHABLE_KEY,
          Authorization: "Bearer " + accessToken
        }
      }
    );

    if (!userResponse.ok) {
      return Response.json({ error: "Invalid login" }, { status: 401 });
    }

    const user = await userResponse.json();

    if (!user.id) {
      return Response.json({ error: "Invalid user" }, { status: 401 });
    }

    const now = Math.floor(Date.now() / 1000);

    const payload = {
      iss: env.LIVEKIT_API_KEY,
      sub: user.id,
      iat: now,
      nbf: now,
      exp: now + 3600,
      name: "Arkadaş",
      video: {
        roomJoin: true,
        room: "salim-voice",
        canPublish: true,
        canSubscribe: true
      }
    };

    const token = await signJWT(
      payload,
      env.LIVEKIT_API_KEY,
      env.LIVEKIT_API_SECRET
    );

    return Response.json({
      token,
      serverUrl: env.LIVEKIT_URL
    });
  } catch (error) {
    console.error("Token error:", error);
    return Response.json(
      { error: "Token could not be created" },
      { status: 500 }
    );
  }
}
