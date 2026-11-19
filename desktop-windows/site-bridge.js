(() => {
  if (window.top !== window || location.origin !== "https://birartibir.online") return;

  document.addEventListener("DOMContentLoaded",()=>{
    const refresh = document.getElementById("refresh-app-btn");
    if (refresh) refresh.style.display = "none";
  },{once:true});

  let lastConfiguration = null;
  let nativeKeyDown = null;

  function releaseKey() {
    if (!nativeKeyDown) return;
    window.dispatchEvent(new KeyboardEvent("keyup", {code: nativeKeyDown}));
    nativeKeyDown = null;
  }

  function updateConfiguration() {
    const enabled = document.getElementById("ptt-enabled")?.checked === true;
    const key = enabled ? (localStorage.getItem("birartibir_ptt_key") || "KeyV") : null;
    if (key === lastConfiguration) return;
    releaseKey();
    lastConfiguration = key;
    window.chrome.webview.postMessage(key || "");
  }

  function configureAfterPageEvent() {
    queueMicrotask(updateConfiguration);
  }

  window.addEventListener("keydown", configureAfterPageEvent);
  window.addEventListener("change", configureAfterPageEvent);
  window.addEventListener("DOMContentLoaded", updateConfiguration, {once: true});
  window.addEventListener("focus", updateConfiguration);
  window.addEventListener("pagehide", releaseKey);
  setInterval(updateConfiguration, 1000);

  let lastOverlay = null;
  function updateOverlay() {
    const connected = typeof livekitRoom !== "undefined" && livekitRoom &&
      !joiningVoice && !leavingVoice;
    const rows = connected ? [...document.querySelectorAll("#sidebar-voice-users .sidebar-person[data-user-id]")] : [];
    const people = rows.slice(0, 12).map(row => {
      const mic = row.querySelector(".mic-status")?.title;
      const state = row.dataset.userId === "birartibir-room-music" ? "music" :
        mic === "Mikrofon kapalı" ? "muted" :
        row.classList.contains("speaking") ? "speaking" : "open";
      return {Name: (row.querySelector(".voice-person-name")?.textContent || "Arkadaş").trim().slice(0, 40), State: state};
    });
    const snapshot = JSON.stringify({
      Room: (document.getElementById("selected-room-label")?.textContent || "").trim().slice(0, 40),
      Count: rows.length, People: people
    });
    if (snapshot === lastOverlay) return;
    lastOverlay = snapshot;
    window.chrome.webview.postMessage("overlay:" + snapshot);
  }

  function observeOverlay() {
    const observer = new MutationObserver(updateOverlay);
    for (const id of ["sidebar-voice-users", "voice-status", "selected-room-label", "leave-btn"]) {
      const target = document.getElementById(id);
      if (target) observer.observe(target, {attributes: true, childList: true, characterData: true, subtree: true});
    }
    updateOverlay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observeOverlay, {once: true});
  } else observeOverlay();
  window.addEventListener("pagehide", () => window.chrome.webview.postMessage('overlay:{"Count":0,"People":[]}'));

  window.chrome.webview.addEventListener("message", ({data}) => {
    if (data?.kind !== "desktop-ptt" || typeof data.code !== "string") return;
    if (data.down === false) {
      if (data.code === nativeKeyDown) releaseKey();
      return;
    }
    if (data.down !== true || data.code !== lastConfiguration || nativeKeyDown) return;
    const leaveButton = document.getElementById("leave-btn");
    const rebinding = document.getElementById("ptt-bind")?.textContent === "Bir tuşa bas…";
    if (!leaveButton || leaveButton.disabled || rebinding) return;
    window.dispatchEvent(new KeyboardEvent("keydown", {code: data.code}));
    nativeKeyDown = data.code;
  });
})();
