import { createHmac, randomBytes } from "node:crypto";

export function getRtcConfig(env = process.env, now = Date.now()) {
  const iceServers = [{ urls: "stun:stun.cloudflare.com:3478" }];
  const urls = (env.TURN_URLS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (urls.some((url) => !/^turns?:[^\s]+$/.test(url))) {
    throw new Error(
      "TURN_URLS must contain comma-separated turn: or turns: URLs.",
    );
  }
  let credentials;
  if (urls.length && env.TURN_SECRET) {
    const username = `${Math.floor(now / 1000) + 3600}:${randomBytes(8).toString("hex")}`;
    credentials = {
      username,
      credential: createHmac("sha1", env.TURN_SECRET)
        .update(username)
        .digest("base64"),
    };
  } else if (urls.length && env.TURN_USERNAME && env.TURN_PASSWORD) {
    credentials = {
      username: env.TURN_USERNAME,
      credential: env.TURN_PASSWORD,
    };
  }
  if (urls.length && !credentials) {
    throw new Error("Set TURN_SECRET or both TURN_USERNAME and TURN_PASSWORD.");
  }
  if (credentials) iceServers.push({ urls, ...credentials });
  const relayOnly = env.ICE_RELAY_ONLY === "true";
  if (relayOnly && !credentials)
    throw new Error("ICE_RELAY_ONLY requires a configured TURN relay.");
  return {
    iceServers,
    iceTransportPolicy: relayOnly ? "relay" : "all",
    relayConfigured: Boolean(credentials),
  };
}
