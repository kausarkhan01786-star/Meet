export const MEETING_SESSION_KEY = "meeting.session.v1";

export function normalizeMeetingSession(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    view: ["single", "group"].includes(source.view) ? source.view : "home",
    minimized: source.minimized === true,
    pickerOpen: source.pickerOpen === true,
    mode: ["create", "join"].includes(source.mode) ? source.mode : null,
    name: typeof source.name === "string" ? source.name.slice(0, 40) : "",
    code:
      typeof source.code === "string" && /^\d{0,6}$/.test(source.code)
        ? source.code
        : "",
    roomCode:
      typeof source.roomCode === "string" && /^\d{6}$/.test(source.roomCode)
        ? source.roomCode
        : "",
    tab: source.tab === "people" ? "people" : "chat",
    chatOpen: typeof source.chatOpen === "boolean" ? source.chatOpen : null,
  };
}

export function readMeetingSession(storage) {
  try {
    return normalizeMeetingSession(
      JSON.parse(
        (storage || globalThis.sessionStorage)?.getItem(MEETING_SESSION_KEY) ||
          "null",
      ),
    );
  } catch {
    return normalizeMeetingSession(null);
  }
}

export function saveMeetingSession(update, storage) {
  try {
    const target = storage || globalThis.sessionStorage;
    target?.setItem(
      MEETING_SESSION_KEY,
      JSON.stringify(
        normalizeMeetingSession({ ...readMeetingSession(target), ...update }),
      ),
    );
  } catch {}
}
