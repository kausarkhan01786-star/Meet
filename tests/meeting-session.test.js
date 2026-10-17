import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MEETING_SESSION_KEY,
  normalizeMeetingSession,
  readMeetingSession,
  saveMeetingSession,
} from "../src/meetingSession.js";
import { SOUND_CUES, playFeedback, setSoundsEnabled } from "../src/feedback.js";

test("interaction cues are short, distinct and safe when sound is disabled", () => {
  assert.deepEqual(Object.keys(SOUND_CUES), [
    "click",
    "connected",
    "ended",
    "sent",
  ]);
  for (const notes of Object.values(SOUND_CUES)) {
    assert.ok(
      notes.every(
        ([frequency, offset, duration]) =>
          frequency >= 200 && frequency <= 1500 && offset + duration < 0.5,
      ),
    );
  }
  setSoundsEnabled(false);
  assert.equal(playFeedback("connected"), false);
  setSoundsEnabled(true);
  assert.equal(playFeedback("unknown"), false);
});

test("meeting view and reconnect details survive a tab storage round trip", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  saveMeetingSession(
    {
      view: "group",
      mode: "join",
      name: "Kausar mia",
      code: "123456",
      roomCode: "123456",
      tab: "people",
      chatOpen: true,
    },
    storage,
  );
  saveMeetingSession({ minimized: true }, storage);
  assert.deepEqual(readMeetingSession(storage), {
    view: "group",
    mode: "join",
    name: "Kausar mia",
    code: "123456",
    roomCode: "123456",
    tab: "people",
    chatOpen: true,
    minimized: true,
    pickerOpen: false,
  });
  assert.equal(values.has(MEETING_SESSION_KEY), true);
});

test("invalid or unavailable storage does not break the application", () => {
  assert.equal(
    readMeetingSession({ getItem: () => "invalid json" }).view,
    "home",
  );
  const blocked = {
    getItem() {
      throw new Error("Blocked");
    },
    setItem() {
      throw new Error("Blocked");
    },
  };
  assert.equal(readMeetingSession(blocked).mode, null);
  assert.doesNotThrow(() => saveMeetingSession({ view: "single" }, blocked));
  const state = normalizeMeetingSession({
    view: "unknown",
    mode: "invalid",
    name: "x".repeat(100),
    code: "<html>",
    roomCode: "123",
    token: "not retained",
  });
  assert.equal(state.view, "home");
  assert.equal(state.name.length, 40);
  assert.equal(state.code, "");
  assert.equal(state.roomCode, "");
  assert.equal("token" in state, false);
});
