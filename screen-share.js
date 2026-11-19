const screenShares = new Map();
let screenRoom = null;
let screenCapture = null;

function isScreenShareAudio(publication) {
  return publication?.source === "screen_share_audio";
}

function screenShareButtons() {
  const active = screenRoom && screenRoom === livekitRoom && !joiningVoice && !leavingVoice;
  const supported = typeof navigator.mediaDevices?.getDisplayMedia === "function";
  $("start-screen-share").disabled = !active || !supported || Boolean(screenCapture);
  $("stop-screen-share").disabled = !screenCapture;
  $("screen-share-support").hidden = supported;
}

function removeScreenCapture(capture = screenCapture) {
  if (!capture) return;
  if (screenCapture === capture) screenCapture = null;
  for (const track of capture.stream?.getTracks() ?? []) track.stop();
  for (const track of capture.published) void capture.room.localParticipant.unpublishTrack(track).catch(console.warn);
  capture.published.clear();
  screenShareButtons();
}

async function startScreenCapture() {
  const room = livekitRoom;
  if (!room || room !== screenRoom || screenCapture) return;
  const capture = {room, stream:null, published:new Set()};
  screenCapture = capture;
  screenShareButtons();
  setText("screen-share-status","");
  try {
    capture.stream = await navigator.mediaDevices.getDisplayMedia({
      video:{frameRate:{ideal:30,max:30}},
      audio:true,
      systemAudio:"include",
      windowAudio:"window",
      selfBrowserSurface:"exclude"
    });
    if (screenCapture !== capture) return removeScreenCapture(capture);
    const video = capture.stream.getVideoTracks()[0];
    if (!video) throw new Error("Görüntü alınamadı.");
    video.addEventListener("ended",()=>{
      if (screenCapture === capture) stopScreenCapture();
    },{once:true});
    const audio = capture.stream.getAudioTracks()[0];
    const tracks = [[video,"screen_share"],[audio,"screen_share_audio"]];
    let audioPublished = false;
    for (const [track,source] of tracks) {
      if (!track || track.readyState === "ended") continue;
      try {
        await room.localParticipant.publishTrack(track,{source});
      } catch (error) {
        if (source !== "screen_share_audio" || screenCapture !== capture) throw error;
        track.stop();
        console.warn("Yayın sesi yayımlanamadı:",error);
        break;
      }
      capture.published.add(track);
      if (screenCapture !== capture) return removeScreenCapture(capture);
      if (source === "screen_share_audio") {
        audioPublished = true;
        audio.addEventListener("ended",()=>{
          if (screenCapture === capture) setText("screen-share-status","Ekran paylaşılıyor. Yayın sesi sona erdi.");
        },{once:true});
      }
    }
    if (video.readyState === "ended") return stopScreenCapture();
    setText("screen-share-status",audioPublished ? "Ekran ve ses paylaşılıyor." :
      "Ekran paylaşılıyor. Yayına ses eklemek için paylaşım penceresinde ses seçeneğini işaretle.");
  } catch (error) {
    const current = screenCapture === capture;
    removeScreenCapture(capture);
    if (current && error.name !== "NotAllowedError" && error.name !== "AbortError") {
      setText("screen-share-status","Paylaşım başlatılamadı. Oyunu veya ekranı yeniden seç.");
    }
  }
}

function stopScreenCapture() {
  removeScreenCapture();
  setText("screen-share-status","");
}

function detachScreenViewer(viewer) {
  for (const element of viewer.media.querySelectorAll("video,audio")) {
    element.pause();
    if (element.tagName === "VIDEO") viewer.video?.detach(element);
    else viewer.audio?.detach(element);
    element.remove();
  }
}

function paintScreenViewer(viewer) {
  detachScreenViewer(viewer);
  viewer.button.textContent = viewer.watching ? "İzlemeyi bırak" : "Yayını izle";
  viewer.label.textContent = (viewer.participant.name || "Arkadaş") + " · Ekran yayını";
  viewer.label.id = viewer.titleId;
  viewer.button.setAttribute("aria-describedby",viewer.titleId);
  if (!viewer.watching || !viewer.video) return;
  const video = viewer.video.attach();
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  video.controls = true;
  video.setAttribute("aria-label","Ekran yayını");
  viewer.media.appendChild(video);
  if (viewer.audio) {
    const audio = viewer.audio.attach();
    audio.autoplay = true;
    audio.controls = true;
    audio.setAttribute("aria-label","Ekran yayını sesi");
    viewer.media.appendChild(audio);
    void audio.play().catch(()=>{ /* Native controls allow playback after a browser autoplay block. */ });
  }
}

let screenViewerSequence = 0;
function refreshScreenViewer(track,publication,participant,removed=false) {
  const source = publication?.source;
  if (source !== "screen_share" && source !== "screen_share_audio") return;
  const key = participant.identity;
  const type = source === "screen_share" ? "video" : "audio";
  let viewer = screenShares.get(key);
  if (!viewer) {
    if (removed) return;
    const row = document.createElement("div");
    row.className = "screen-viewer";
    const label = document.createElement("span");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "muted-btn";
    const media = document.createElement("div");
    row.append(label,button,media);
    viewer = {participant,row,label,button,media,titleId:"screen-viewer-"+(++screenViewerSequence),
      watching:false,video:null,audio:null};
    screenShares.set(key,viewer);
    button.addEventListener("click",()=>{
      viewer.watching = !viewer.watching;
      paintScreenViewer(viewer);
    });
  }
  if (removed && viewer[type] !== track) return;
  // Detach using the currently attached track before replacing references.
  detachScreenViewer(viewer);
  viewer[type] = removed ? null : track;
  if (!viewer.video) {
    viewer.row.remove();
    if (!viewer.audio) screenShares.delete(key);
    return;
  }
  if (!viewer.row.isConnected) $("screen-viewers").appendChild(viewer.row);
  paintScreenViewer(viewer);
}

function clearScreenViewers() {
  for (const viewer of screenShares.values()) detachScreenViewer(viewer);
  screenShares.clear();
  $("screen-viewers").replaceChildren();
}

function resetScreenSharing(room = null) {
  stopScreenCapture();
  clearScreenViewers();
  screenRoom = room;
  if (room) {
    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications?.values() ?? []) {
        if (publication.track) refreshScreenViewer(publication.track,publication,participant);
      }
    }
  }
  screenShareButtons();
}

function bindScreenSharing(room) {
  screenRoom = room;
  const events = LivekitClient.RoomEvent;
  room.on(events.TrackSubscribed,(track,publication,participant)=>{
    if (screenRoom === room) refreshScreenViewer(track,publication,participant);
  });
  room.on(events.TrackUnsubscribed,(track,publication,participant)=>{
    if (screenRoom === room) refreshScreenViewer(track,publication,participant,true);
  });
  room.on(events.ParticipantDisconnected,participant=>{
    if (screenRoom !== room) return;
    const viewer = screenShares.get(participant.identity);
    if (!viewer) return;
    detachScreenViewer(viewer);
    viewer.row.remove();
    screenShares.delete(participant.identity);
  });
}
