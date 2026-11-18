import asyncio
import hmac
import logging
import os
import re
import signal

from aiohttp import web
from livekit import api, rtc

ROOMS = {"genel", "oyun", "muhabbet"}
BOT_ID = "birartibir-music-bot"
SAMPLE_RATE = 48000
CHANNELS = 2
SAMPLES = SAMPLE_RATE // 50
FRAME_BYTES = SAMPLES * CHANNELS * 2


class Decoder:
    def __init__(self):
        self.processes = []

    async def open(self, video_id):
        read_fd, write_fd = os.pipe()
        try:
            downloader = await asyncio.create_subprocess_exec(
                "yt-dlp", "--ignore-config", "--no-playlist", "--no-progress",
                "--js-runtimes", "deno", "--socket-timeout", "8", "--retries", "1",
                "-f", "bestaudio/best", "-o", "-",
                f"https://www.youtube.com/watch?v={video_id}",
                stdout=write_fd, stdin=asyncio.subprocess.DEVNULL, start_new_session=True,
            )
            self.processes.append(downloader)
            decoder = await asyncio.create_subprocess_exec(
                "ffmpeg", "-nostdin", "-loglevel", "error", "-protocol_whitelist", "pipe",
                "-i", "pipe:0", "-vn", "-t", "1800", "-af", "volume=0.45",
                "-ac", str(CHANNELS), "-ar", str(SAMPLE_RATE), "-f", "s16le", "pipe:1",
                stdin=read_fd, stdout=asyncio.subprocess.PIPE, start_new_session=True,
            )
            self.processes.append(decoder)
            self.output = decoder.stdout
        finally:
            os.close(read_fd)
            os.close(write_fd)

    async def read(self):
        try:
            return await self.output.readexactly(FRAME_BYTES)
        except asyncio.IncompleteReadError:
            return b""

    async def close(self):
        for process in self.processes:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        for process in self.processes:
            await process.communicate()


class MusicBot:
    def __init__(self, url, key, secret, command_secret):
        self.url = url
        self.key = key
        self.secret = secret
        self.command_secret = command_secret
        self.lock = asyncio.Lock()
        self.playback = None
        self.active_room = None

    async def stop(self):
        if self.playback:
            self.playback.cancel()
            await asyncio.gather(self.playback, return_exceptions=True)
            self.playback = None
            self.active_room = None

    async def connect(self, room_name):
        token = (
            api.AccessToken(self.key, self.secret)
            .with_identity(BOT_ID)
            .with_name("Müzik Botu")
            .with_grants(api.VideoGrants(
                room_join=True, room=room_name, can_subscribe=False, can_publish_data=False,
                can_publish_sources=["microphone"],
            ))
            .to_jwt()
        )
        room = rtc.Room()
        source = rtc.AudioSource(SAMPLE_RATE, CHANNELS, queue_size_ms=100)
        try:
            async with asyncio.timeout(8):
                await room.connect(self.url, token, rtc.RoomOptions(auto_subscribe=False))
                track = rtc.LocalAudioTrack.create_audio_track("youtube-music", source)
                await room.local_participant.publish_track(
                    track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
                )
        except BaseException:
            await self.close_room(room, source)
            raise
        return room, source

    async def close_room(self, room, source):
        try:
            await room.disconnect()
        finally:
            await source.aclose()

    async def stream(self, room, source, decoder, data):
        try:
            while data and room.isconnected() and room.remote_participants:
                await source.capture_frame(rtc.AudioFrame(data, SAMPLE_RATE, CHANNELS, SAMPLES))
                data = await asyncio.wait_for(decoder.read(), timeout=10)
            if not data:
                await source.wait_for_playout()
        except Exception:
            logging.exception("Music playback ended unexpectedly")
        finally:
            try:
                await self.close_room(room, source)
            finally:
                await decoder.close()

    async def play(self, room_name, video_id, user_id):
        decoder = Decoder()
        started = False
        try:
            try:
                async with asyncio.timeout(12):
                    await decoder.open(video_id)
                    first_frame = await decoder.read()
            except TimeoutError:
                return 422
            if not first_frame:
                return 422
            if not await self.is_in_room(room_name, user_id):
                return 403
            await self.stop()
            room, source = await self.connect(room_name)
            self.active_room = room_name
            self.playback = asyncio.create_task(self.stream(room, source, decoder, first_frame))
            # Hand cleanup ownership to the playback task before a stop can cancel it.
            started = True
            await asyncio.sleep(0)
            return 200
        finally:
            if not started:
                await decoder.close()

    async def is_in_room(self, room, user_id):
        async with asyncio.timeout(3):
            async with api.LiveKitAPI(self.url, self.key, self.secret) as livekit:
                try:
                    member = await livekit.room.get_participant(
                        api.RoomParticipantIdentity(room=room, identity=user_id)
                    )
                    return member.state == api.ParticipantInfo.ACTIVE
                except api.TwirpError as error:
                    if error.code == "not_found":
                        return False
                    raise

    async def command(self, request):
        supplied = request.headers.get("Authorization", "").encode()
        expected = ("Bearer " + self.command_secret).encode()
        if not hmac.compare_digest(supplied, expected):
            return web.Response(status=401)
        try:
            body = await request.json()
        except (ValueError, TypeError):
            return web.Response(status=400)
        if not isinstance(body, dict):
            return web.Response(status=400)
        action, room, user_id, video_id = (body.get(key) for key in ("action", "room", "userId", "videoId"))
        if not isinstance(room, str) or room not in ROOMS or action not in ("play", "stop"):
            return web.Response(status=400)
        if not isinstance(user_id, str) or not re.fullmatch(r"[a-fA-F0-9-]{36}", user_id):
            return web.Response(status=400)
        if action == "play" and (not isinstance(video_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id)):
            return web.Response(status=400)

        if self.lock.locked():
            return web.Response(status=409)
        async with self.lock:
            if not await self.is_in_room(room, user_id):
                return web.Response(status=403)
            if action == "play":
                return web.Response(status=await self.play(room, video_id, user_id))
            if self.active_room != room or not self.playback or self.playback.done():
                return web.Response(status=409)
            await self.stop()
            return web.Response(status=200)


def main():
    bot = MusicBot(
        os.environ["LIVEKIT_URL"], os.environ["LIVEKIT_API_KEY"],
        os.environ["LIVEKIT_API_SECRET"], os.environ["MUSIC_BOT_SECRET"],
    )
    if not bot.command_secret:
        raise ValueError("MUSIC_BOT_SECRET is required")
    app = web.Application(client_max_size=4096)
    app.router.add_post("/command", bot.command)

    async def shutdown(_app):
        async with bot.lock:
            await bot.stop()

    app.on_shutdown.append(shutdown)
    web.run_app(app, port=int(os.environ.get("PORT", "8080")))


if __name__ == "__main__":
    main()
