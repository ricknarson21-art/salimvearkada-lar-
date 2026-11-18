import { ALLOWED_ROOMS, authenticateVoiceUser } from "./_voice-auth.js";
import { roleOf, roomCall } from "./moderation.js";

const STATE_URL = "https://bariaxpogmteuxsvbhjo.supabase.co/rest/v1/room_music_session";
const QUEUE_URL = new URL("rpc/change_room_music_queue", STATE_URL.replace(/room_music_session$/, ""));
const TRACK_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const FIELDS = "room,video_id,started_at,paused_position,queue,track_id";
const reply = (body, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" }
});

async function stateRequest(env, method, filters, body) {
  const response = await fetch(STATE_URL + filters, {
    method,
    cache: "no-store",
    headers: {
      apikey: env.SUPABASE_SECRET_KEY.trim(),
      "Content-Type": "application/json",
      ...(method === "PATCH" ? { Prefer: "return=representation" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!response.ok) throw new Error("Music state request failed (" + response.status + ")");
  if (response.status === 204) return null;
  return (await response.json())[0] ?? null;
}

async function inVoiceRoom(env, room, identity) {
  const result = await roomCall(env, "ListParticipants", room, { room });
  return result.participants?.some(participant => participant.identity === identity) ?? false;
}

function notifyRooms(env, rooms, waitUntil) {
  const notifications = Promise.allSettled(rooms.map(room => roomCall(env, "SendData", room, {
    room, topic: "birartibir.music.changed", data: btoa("changed"),
    kind: "RELIABLE", nonce: btoa(crypto.randomUUID())
  })));
  waitUntil(notifications);
}

export async function onRequestPost({ request, env, waitUntil = () => {} }) {
  try {
    const user = await authenticateVoiceUser(request, env);
    if (user instanceof Response) return user;

    const body = await request.json().catch(() => null);
    const room = body?.roomName;
    const action = body?.action;
    if (!ALLOWED_ROOMS.has(room) || !["state", "play", "stop", "seek", "pause", "resume", "end", "skip", "clear"].includes(action)) {
      return reply({ error: "Geçersiz müzik komutu veya ses odası." }, 400);
    }

    if (action === "state") {
      const session = await stateRequest(env, "GET", `?slot=eq.1&room=eq.${room}&select=${FIELDS}`);
      if (session && !await inVoiceRoom(env, room, user.id)) {
        return reply({ error: "Önce bu ses odasına katıl." }, 403);
      }
      return reply({ session, now: Date.now() });
    }

    const videoId = action === "play" ? youtubeVideoId(body.url) : null;
    if (action === "play" && !videoId) {
      return reply({ error: "Geçerli bir YouTube video bağlantısı gir." }, 400);
    }

    if (!await inVoiceRoom(env, room, user.id)) {
      return reply({ error: "Önce bu ses odasına katıl." }, 403);
    }

    if (["seek", "pause", "resume"].includes(action)) {
      const { videoId: currentVideo, startedAt, position } = body;
      if (typeof currentVideo !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(currentVideo)
          || typeof startedAt !== "string" || !Number.isFinite(Date.parse(startedAt))
          || !Number.isFinite(position) || position < 0 || position > 43200) {
        return reply({ error: "Geçersiz oynatma konumu." }, 400);
      }
      const filters = new URLSearchParams({
        slot: "eq.1", room: `eq.${room}`, video_id: `eq.${currentVideo}`,
        started_at: `eq.${new Date(startedAt).toISOString()}`, select: FIELDS
      });
      if (typeof body.trackId === "string" && TRACK_ID.test(body.trackId)) {
        filters.set("track_id", `eq.${body.trackId}`);
      }
      const session = await stateRequest(env, "PATCH", "?" + filters, {
        started_at: new Date(Date.now() - position * 1000).toISOString(),
        paused_position: action === "pause" || (action === "seek" && body.paused === true) ? position : null
      });
      if (!session) return reply({ error: "Müzik oturumu değişti." }, 409);
      notifyRooms(env, [room], waitUntil);
      return reply({ session, now: Date.now() });
    }

    if (["skip", "clear"].includes(action)) {
      const role = await roleOf(env.SUPABASE_SECRET_KEY.trim(), user.id);
      if (!["owner", "admin"].includes(role)) {
        return reply({ error: "Bu işlemi yalnızca yetkililer yapabilir." }, 403);
      }
    }

    const trackId = body.trackId;
    if (["end", "skip"].includes(action) &&
        (typeof trackId !== "string" || !TRACK_ID.test(trackId))) {
      return reply({ error: "Geçersiz parça." }, 400);
    }

    const response = await fetch(QUEUE_URL, {
      method: "POST",
      headers: { apikey: env.SUPABASE_SECRET_KEY.trim(), "Content-Type": "application/json" },
      body: JSON.stringify({ p_action: action, p_room: room, p_video: videoId, p_track: trackId || null })
    });
    if (!response.ok) throw new Error("Music queue request failed (" + response.status + ")");
    const result = await response.json();
    if (result.error === "queue_full") return reply({ error: "Müzik sırası dolu." }, 409);
    if (result.error) throw new Error(result.error);
    notifyRooms(env, action === "play" ? [...ALLOWED_ROOMS] : [room], waitUntil);
    return reply({ session: result.session, now: Date.now() });
  } catch (error) {
    console.error("Music session:", error.message);
    return reply({ error: "Müzik oturumuna şu anda ulaşılamıyor." }, 502);
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
