import { ALLOWED_ROOMS, authenticateVoiceUser } from "./_voice-auth.js";
import { roomCall } from "./moderation.js";

const PROFILE_URL = "https://bariaxpogmteuxsvbhjo.supabase.co/rest/v1/profiles";
const USER_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export async function onRequestPost({ request, env }) {
  try {
    const user = await authenticateVoiceUser(request, env);
    if (user instanceof Response) return user;
    const rosters = await Promise.all([...ALLOWED_ROOMS].map(async room => {
      try {
        const {participants = []} = await roomCall(env,"ListParticipants",room,{room});
        return [room,participants.filter(person=>USER_ID.test(person.identity))];
      } catch (error) {
        if (error.message === "Katılımcı veya oda bulunamadı") return [room,[]];
        console.warn("Room roster lookup:",room,error);
        return [room,null];
      }
    }));
    const ids = [...new Set(rosters.flatMap(([, people]) => (people ?? []).map(person=>person.identity)))];
    let profiles = [];
    if (ids.length) {
      const filters = new URLSearchParams({select:"user_id,username",user_id:"in.("+ids.join(",")+")"});
      const response = await fetch(PROFILE_URL+"?"+filters,{
        cache:"no-store",headers:{apikey:env.SUPABASE_SECRET_KEY.trim()}
      });
      if (!response.ok) throw new Error("Kullanıcı adları okunamadı.");
      profiles = await response.json();
    }
    const names = new Map(profiles.map(person=>[person.user_id,person.username]));
    const rooms = Object.fromEntries(rosters.map(([room, people]) => [
      room,people && people.map(person=>names.get(person.identity) || person.name || "Arkadaş")
    ]));
    return Response.json({rooms},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    console.error("Room roster:",error);
    return Response.json({error:"Oda listesi okunamadı."},{status:502});
  }
}
