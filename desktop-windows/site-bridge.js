(() => {
  if (window.top !== window || location.origin !== "https://birartibir.online") return;

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
