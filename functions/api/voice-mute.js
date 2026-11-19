import { ALLOWED_ROOMS, authenticateVoiceUser } from "./_voice-auth.js";
import { isTimedMutePermission, muteExpiry, setTimedMutePermission } from "./_timed-mute.js";
import { roomCall } from "./moderation.js";

export async function onRequestPost({ request, env }) {
  try {
    const user = await authenticateVoiceUser(request, env);
    if (user instanceof Response) return user;
    const body = await request.json().catch(() => null);
    const room = body?.roomName;
    if (!ALLOWED_ROOMS.has(room)) return Response.json({ error: "Geçersiz oda" }, { status: 400 });

    let expiresAt = await muteExpiry(env, user.id);
    if (expiresAt && expiresAt <= Date.now()) {
      const participants = await roomCall(env, "ListParticipants", room, { room });
      const person = participants.participants?.find(item => item.identity === user.id);
      if (person && isTimedMutePermission(person.permission)) {
        expiresAt = await muteExpiry(env, user.id);
        if (expiresAt <= Date.now()) {
          await setTimedMutePermission(roomCall, env, room, person, false);
          expiresAt = await muteExpiry(env, user.id);
          // A moderator can extend the lock while an earlier check is restoring permission.
          if (expiresAt > Date.now()) await setTimedMutePermission(roomCall, env, room, person, true);
        }
      }
    }
    const now = Date.now();
    return Response.json({ mutedUntil: expiresAt > now ? expiresAt : 0, now }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("Timed voice mute sync:", error);
    return Response.json({ error: "Mikrofon izni eşitlenemedi." }, { status: 502 });
  }
}
