import { ALLOWED_ROOMS, authenticateVoiceUser } from "./_voice-auth.js";
import { activeRoomMutes } from "./_timed-mute.js";
import { roomCall } from "./moderation.js";

export async function onRequestPost({ request, env }) {
  try {
    const user = await authenticateVoiceUser(request, env);
    if (user instanceof Response) return user;
    const room = (await request.json().catch(()=>null))?.roomName;
    if (!ALLOWED_ROOMS.has(room)) return Response.json({error:"Geçersiz oda"},{status:400});
    const roster = await roomCall(env,"ListParticipants",room,{room});
    const now = Date.now();
    const mutes = await activeRoomMutes(env,(roster.participants ?? []).map(person=>person.identity),now);
    return Response.json({mutes,now},{headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    console.error("Room mute status:",error);
    return Response.json({error:"Susturma süreleri okunamadı."},{status:502});
  }
}
