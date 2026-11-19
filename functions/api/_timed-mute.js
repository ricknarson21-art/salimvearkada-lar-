const dataUrl = "https://bariaxpogmteuxsvbhjo.supabase.co/rest/v1/";
export const mutedSources = ["camera", "screen_share", "screen_share_audio"];

async function muteData(env, path, body, method = body ? "POST" : "GET") {
  const response = await fetch(dataUrl + path, {
    cache: "no-store",
    method,
    headers: { apikey: env.SUPABASE_SECRET_KEY.trim(), "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!response.ok) throw new Error("Susturma kaydı okunamadı veya kaydedilemedi.");
  return response.status === 204 ? null : response.json();
}

export async function muteExpiry(env, userId) {
  const rows = await muteData(env, "timed_voice_mutes?select=expires_at&user_id=eq." + encodeURIComponent(userId));
  return Date.parse(rows[0]?.expires_at) || 0;
}

export function extendTimedMute(env, userId, seconds) {
  return muteData(env, "rpc/extend_timed_voice_mute", { target_id: userId, seconds });
}

export function clearTimedMute(env, userId) {
  return muteData(env, "timed_voice_mutes?user_id=eq." + encodeURIComponent(userId),
    { expires_at: new Date(1).toISOString() }, "PATCH");
}

export function isTimedMutePermission(permission) {
  const raw = permission?.canPublishSources ?? permission?.can_publish_sources;
  const sources = raw?.map(value => ({ 1: "camera", 3: "screen_share", 4: "screen_share_audio" }[value]
    ?? String(value).toLowerCase()));
  return sources?.length === 3 && mutedSources.every(source => sources.includes(source));
}

export async function setTimedMutePermission(roomCall, env, room, person, muted) {
  const permission = person.permission;
  if (!permission) throw new Error("LiveKit katılımcı izinleri alınamadı.");
  const { can_publish_sources: _legacy, ...properties } = permission;
  await roomCall(env, "UpdateParticipant", room, {
    room,
    identity: person.identity,
    permission: { ...properties, canPublishSources: muted ? [1, 3, 4] : [1, 2, 3, 4] }
  });
}
