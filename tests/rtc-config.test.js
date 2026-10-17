import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { getRtcConfig } from "../server/rtc-config.js";
import { loadRtcConfiguration } from "../src/useCast.js";

test("client identifies an outdated server returning HTML instead of RTC settings", async () => {
  await assert.rejects(
    loadRtcConfiguration(async () => new Response("<!doctype html><html></html>", { headers: { "content-type": "text/html" } })),
    /current phone link/,
  );
});

test("client accepts current settings and reports unavailable or malformed settings", async () => {
  const config = getRtcConfig({});
  assert.deepEqual(await loadRtcConfiguration(async () => Response.json(config)), config);
  await assert.rejects(loadRtcConfiguration(async () => new Response("Unavailable", { status: 503 })), /HTTP 503/);
  await assert.rejects(loadRtcConfiguration(async () => Response.json({})), /Invalid connection settings/);
});

test("uses STUN without falsely claiming relay coverage", () => {
  const config = getRtcConfig({});
  assert.match(config.iceServers[0].urls, /^stun:/);
  assert.equal(config.relayConfigured, false);
  assert.equal(config.iceTransportPolicy, "all");
});

test("issues expiring coturn credentials without exposing its shared secret", () => {
  const config = getRtcConfig(
    {
      TURN_URLS: "turn:relay.example:3478, turns:relay.example:5349",
      TURN_SECRET: "test-secret",
      ICE_RELAY_ONLY: "true",
    },
    1700000000000,
  );
  const turn = config.iceServers[1];
  assert.match(turn.username, /^1700003600:/);
  assert.equal(
    turn.credential,
    createHmac("sha1", "test-secret").update(turn.username).digest("base64"),
  );
  assert.equal(turn.urls.length, 2);
  assert.equal(config.iceTransportPolicy, "relay");
  assert.equal(JSON.stringify(config).includes("test-secret"), false);
});

test("supports a provider's TURN credentials and rejects partial configuration", () => {
  const config = getRtcConfig({
    TURN_URLS: "turn:relay.example:3478",
    TURN_USERNAME: "user",
    TURN_PASSWORD: "test-password",
  });
  assert.equal(config.relayConfigured, true);
  assert.equal(config.iceServers[1].credential, "test-password");
  assert.throws(
    () => getRtcConfig({ TURN_URLS: "https://example.com" }),
    /TURN_URLS/,
  );
  assert.throws(
    () => getRtcConfig({ TURN_URLS: "turn:relay.example" }),
    /TURN_SECRET/,
  );
  assert.throws(() => getRtcConfig({ ICE_RELAY_ONLY: "true" }), /requires/);
});
