export const SOUND_CUES = {
  click: [[760, 0, 0.035]],
  connected: [
    [523, 0, 0.1],
    [784, 0.11, 0.14],
  ],
  ended: [
    [440, 0, 0.12],
    [294, 0.13, 0.18],
  ],
  sent: [
    [880, 0, 0.055],
    [1175, 0.06, 0.08],
  ],
};

let context;
let enabled;
const lastPlayed = new Map();

export function getSoundsEnabled() {
  if (enabled === undefined) {
    try {
      enabled =
        typeof window === "undefined" ||
        globalThis.localStorage?.getItem("meeting.sounds") !== "off";
    } catch {
      enabled = true;
    }
  }
  return enabled;
}

export function setSoundsEnabled(value) {
  enabled = Boolean(value);
  if (typeof window === "undefined") return;
  try {
    globalThis.localStorage?.setItem("meeting.sounds", enabled ? "on" : "off");
  } catch {}
  window.dispatchEvent(new Event("meeting-sound-preference"));
}

function audioContext() {
  if (!context || context.state === "closed") {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) return null;
    context = new Context();
  }
  return context;
}

export function unlockFeedback() {
  if (!getSoundsEnabled()) return;
  try {
    const audio = audioContext();
    if (audio?.state === "suspended") void audio.resume().catch(() => {});
  } catch {}
}

export function playFeedback(cue = "click") {
  if (!getSoundsEnabled() || !SOUND_CUES[cue]) return false;
  try {
    const audio = audioContext();
    if (!audio) return false;
    if (audio.state === "suspended") {
      void audio
        .resume()
        .then(() => {
          if (audio.state === "running") playFeedback(cue);
        })
        .catch(() => {});
      return false;
    }
    if (audio.state !== "running") return false;
    const now = Date.now();
    if (now - (lastPlayed.get(cue) || 0) < (cue === "click" ? 45 : 300))
      return false;
    lastPlayed.set(cue, now);
    for (const [frequency, offset, duration] of SOUND_CUES[cue]) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + offset;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(
        cue === "click" ? 0.025 : 0.045,
        start + 0.008,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + duration + 0.01);
    }
    return true;
  } catch {
    return false;
  }
}

export function installInteractionFeedback(target = document) {
  const unlock = () => unlockFeedback();
  const click = (event) => {
    const button = event.target?.closest?.("button, a[href], [role='button']");
    if (
      !button ||
      button.disabled ||
      button.getAttribute("aria-disabled") === "true" ||
      button.closest("[data-sound='none']")
    )
      return;
    unlockFeedback();
    playFeedback("click");
  };
  target.addEventListener("pointerdown", unlock, true);
  target.addEventListener("keydown", unlock, true);
  target.addEventListener("click", click, true);
  return () => {
    target.removeEventListener("pointerdown", unlock, true);
    target.removeEventListener("keydown", unlock, true);
    target.removeEventListener("click", click, true);
  };
}
