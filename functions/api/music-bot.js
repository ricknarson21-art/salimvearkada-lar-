import { ALLOWED_ROOMS, authenticateVoiceUser } from "./_voice-auth.js";

const reply = (body, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" }
});

export async function onRequestPost({ request, env }) {
  try {
    const user = await authenticateVoiceUser(request, env);
    if (user instanceof Response) return user;

    const body = await request.json().catch(() => null);
    if (!ALLOWED_ROOMS.has(body?.roomName) || !["play", "stop"].includes(body?.action)) {
      return reply({ error: "Geçersiz müzik komutu veya ses odası." }, 400);
    }

    let videoId;
    if (body.action === "play") {
      videoId = youtubeVideoId(body.url);
      if (!videoId) return reply({ error: "Geçerli bir YouTube video bağlantısı gir." }, 400);
    }

    if (!env.MUSIC_BOT_URL || !env.MUSIC_BOT_SECRET) {
      return reply({ error: "Müzik botu sunucusu henüz yapılandırılmamış." }, 503);
    }
    const service = new URL("/command", env.MUSIC_BOT_URL);
    if (service.protocol !== "https:") throw new Error("Music bot requires HTTPS");

    const upstream = await fetch(service, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + env.MUSIC_BOT_SECRET
      },
      body: JSON.stringify({ action: body.action, room: body.roomName, userId: user.id, videoId })
    });
    if (upstream.ok) return reply({ ok: true });
    const errors = {
      403: "Önce bu ses odasına katıl.",
      409: "Bot başka bir komutu işliyor veya bu odada çalmıyor.",
      422: "Bu YouTube videosu oynatılamadı. Başka bir bağlantı dene."
    };
    if (errors[upstream.status]) return reply({ error: errors[upstream.status] }, upstream.status);
    throw new Error("Music bot request failed (" + upstream.status + ")");
  } catch (error) {
    console.error("Music bot:", error.message);
    return reply({ error: "Müzik botuna şu anda ulaşılamıyor." }, 502);
  }
}

function youtubeVideoId(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    let id;
    if (url.hostname === "youtu.be") {
      id = /^\/([\w-]+)\/?$/.exec(url.pathname)?.[1];
    } else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(url.hostname)) {
      id = url.pathname === "/watch" ? url.searchParams.get("v")
        : /^\/(?:shorts|live|embed)\/([\w-]+)\/?$/.exec(url.pathname)?.[1];
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id ?? "") ? id : null;
  } catch {
    return null;
  }
}
