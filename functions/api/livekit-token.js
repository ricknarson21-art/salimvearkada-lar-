import { muteExpiry, mutedSources } from "./_timed-mute.js";
import { ALLOWED_ROOMS, authenticateVoiceUser } from "./_voice-auth.js";

const encoder = new TextEncoder();

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signJWT(payload, apiSecret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encode = (obj) => base64url(encoder.encode(JSON.stringify(obj)));
  const message = encode(header) + "." + encode(payload);
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return message + "." + base64url(new Uint8Array(signature));
}

export async function onRequestPost({ request, env }) {
  try {
    const user = await authenticateVoiceUser(request, env);
    if (user instanceof Response) return user;

    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const roomName = typeof body.roomName === "string" ? body.roomName : "genel";
    if (!ALLOWED_ROOMS.has(roomName)) {
      return Response.json({ error: "Geçersiz ses odası" }, { status: 400 });
    }

    const expiry = await muteExpiry(env, user.id);
    const mutedUntil = expiry > Date.now() ? expiry : 0;
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
        room: roomName,
        canPublish: true,
        ...(mutedUntil ? { canPublishSources: mutedSources } : {}),
        canSubscribe: true
      }
    };

    const token = await signJWT(payload, env.LIVEKIT_API_SECRET);
    return Response.json({ token, serverUrl: env.LIVEKIT_URL, roomName, mutedUntil, now: Date.now() });
  } catch (error) {
    console.error("Token error:", error);
    return Response.json({ error: "Token could not be created" }, { status: 500 });
  }
}
