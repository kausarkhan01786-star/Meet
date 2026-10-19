import express from "express";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { networkInterfaces } from "node:os";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import selfsigned from "selfsigned";
import { createPairingService } from "./pairing.js";
import { getRtcConfig } from "./rtc-config.js";
import { loadEnvFile } from "node:process";

try {
  loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const production = process.argv.includes("--production");
const app = express();
const mediaSearchCache = new Map();
const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((entry) => entry.family === "IPv4" && !entry.internal)
  .map((entry) => entry.address);
const port = Number(process.env.PORT || 5173);
const securePort = Number(process.env.HTTPS_PORT || 5443);
const publicUrl =
  process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "";
const publicOrigin = publicUrl ? new URL(publicUrl).origin : "";
if (publicOrigin && !publicOrigin.startsWith("https://")) {
  throw new Error("PUBLIC_URL must use HTTPS.");
}
const localHttps =
  process.env.LOCAL_HTTPS === "true" ||
  (!production && process.env.LOCAL_HTTPS !== "false");
getRtcConfig();
app.disable("x-powered-by");
app.get("/healthz", (request, response) => response.json({ status: "ok" }));
app.get("/api/rtc-config", (request, response) => {
  response.set("Cache-Control", "no-store");
  response.json(getRtcConfig());
});
function getYouTubeVideoId(value) {
  if (typeof value !== "string" || value.length > 1_000) return "";
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] || "";
    else if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
      else if (/^\/(embed|shorts|live)\//.test(url.pathname)) id = url.pathname.split("/")[2] || "";
    }
    return /^[\w-]{11}$/.test(id) ? id : "";
  } catch {
    return "";
  }
}
app.get("/api/media/search", async (request, response) => {
  const kind = request.query.kind === "audio" ? "audio" : request.query.kind === "video" ? "video" : "";
  const query = typeof request.query.q === "string" ? request.query.q.trim().slice(0, 100) : "";
  const pageToken = typeof request.query.pageToken === "string" && request.query.pageToken.length <= 300 ? request.query.pageToken : "";
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!kind || !query) return response.status(400).json({ error: "Choose audio or video and enter a search." });
  if (!apiKey) return response.status(503).json({ error: "YouTube search is not configured. Add YOUTUBE_API_KEY to the server environment." });
  const cacheKey = `${kind}:${query.toLowerCase()}:${pageToken}`;
  const cached = mediaSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return response.json({ items: cached.items, nextPageToken: cached.nextPageToken || "" });
  if (cached) mediaSearchCache.delete(cacheKey);
  const params = new URLSearchParams({ key: apiKey, part: "snippet", type: "video", maxResults: "12", order: kind === "audio" ? "relevance" : "viewCount", videoEmbeddable: "true", videoSyndicated: "true", q: kind === "audio" ? `${query} official music` : query });
  if (kind === "audio") params.set("videoCategoryId", "10");
  if (kind === "video") params.set("videoDuration", "medium");
  if (pageToken) params.set("pageToken", pageToken);
  try {
    const result = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    const data = await result.json();
    if (!result.ok) return response.status(502).json({ error: data.error?.message || "YouTube search failed." });
    const items = (data.items || []).filter((item) => item.id?.videoId).filter((item) => kind !== "video" || !/\b(shorts?|reels?)\b/i.test(item.snippet?.title || "")).map((item) => ({ videoId: item.id.videoId, title: item.snippet?.title || "Untitled video", channel: item.snippet?.channelTitle || "YouTube", thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "" }));
    const payload = { items, nextPageToken: data.nextPageToken || "" };
    mediaSearchCache.set(cacheKey, { ...payload, expiresAt: Date.now() + 5 * 60_000 });
    while (mediaSearchCache.size > 100) mediaSearchCache.delete(mediaSearchCache.keys().next().value);
    response.set("Cache-Control", "private, max-age=120");
    return response.json(payload);
  } catch {
    return response.status(502).json({ error: "Could not reach YouTube search right now." });
  }
});
app.get("/api/media/lookup", async (request, response) => {
  const videoId = getYouTubeVideoId(request.query.url);
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!videoId) return response.status(400).json({ error: "Paste a valid YouTube or YouTube Music link." });
  if (!apiKey) return response.status(503).json({ error: "YouTube search is not configured. Add YOUTUBE_API_KEY to the server environment." });
  const cacheKey = `lookup:${videoId}`;
  const cached = mediaSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return response.json(cached.item);
  try {
    const params = new URLSearchParams({ key: apiKey, part: "snippet,status", id: videoId });
    const result = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
    const data = await result.json();
    if (!result.ok) return response.status(502).json({ error: data.error?.message || "YouTube lookup failed." });
    const video = data.items?.[0];
    if (!video) return response.status(404).json({ error: "This YouTube item was not found." });
    if (!video.status?.embeddable) return response.status(400).json({ error: "This YouTube item cannot be played inside a meeting." });
    const item = { videoId, title: video.snippet?.title || "Untitled media", channel: video.snippet?.channelTitle || "YouTube", thumbnail: video.snippet?.thumbnails?.medium?.url || video.snippet?.thumbnails?.default?.url || "", suggestedKind: video.snippet?.categoryId === "10" ? "audio" : "video" };
    mediaSearchCache.set(cacheKey, { item, expiresAt: Date.now() + 5 * 60_000 });
    while (mediaSearchCache.size > 100) mediaSearchCache.delete(mediaSearchCache.keys().next().value);
    return response.json(item);
  } catch {
    return response.status(502).json({ error: "Could not reach YouTube right now." });
  }
});
app.get("/api/network", (request, response) => {
  response.json({
    urls: publicOrigin
      ? [publicOrigin]
      : localHttps
        ? addresses.map((address) => `https://${address}:${securePort}`)
        : [],
    mode: publicOrigin ? "internet" : "local",
    relayConfigured: getRtcConfig().relayConfigured,
    securePort,
  });
});
if (production) {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (request, response) =>
    response.sendFile(resolve("dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

if (localHttps) await mkdir(".cert", { recursive: true });
let credentials;
if (localHttps)
  try {
    credentials = JSON.parse(await readFile(".cert/localhost.json", "utf8"));
    if (
      credentials.addresses.join() !== addresses.join() ||
      credentials.expiresAt < Date.now()
    )
      throw new Error("Renew certificate");
  } catch {
    const certificate = await selfsigned.generate(
      [{ name: "commonName", value: "Relay Local" }],
      {
        days: 365,
        keySize: 2048,
        algorithm: "sha256",
        extensions: [
          {
            name: "subjectAltName",
            altNames: [
              { type: 2, value: "localhost" },
              { type: 7, ip: "127.0.0.1" },
              ...addresses.map((ip) => ({ type: 7, ip })),
            ],
          },
        ],
      },
    );
    credentials = {
      key: certificate.private,
      cert: certificate.cert,
      addresses,
      expiresAt: Date.now() + 300 * 86400_000,
    };
    await writeFile(".cert/localhost.json", JSON.stringify(credentials), {
      mode: 0o600,
    });
  }
const pairing = createPairingService({
  allowedOrigins: publicOrigin ? [publicOrigin] : [],
  trustProxy: process.env.TRUST_PROXY === "true",
});
const http = createHttpServer(app);
const https = localHttps ? createHttpsServer(credentials, app) : null;
pairing.attach(http);
if (https) pairing.attach(https);
http.on("error", (error) => {
  console.error(`HTTP server: ${error.message}. Choose a different PORT.`);
  process.exit(1);
});
https?.on("error", (error) => {
  console.error(
    `HTTPS server: ${error.message}. Choose a different HTTPS_PORT.`,
  );
  process.exit(1);
});
http.listen(port, "0.0.0.0", () =>
  console.log(`Relay PC: http://localhost:${http.address().port}`),
);
https?.listen(securePort, "0.0.0.0", () => {
  for (const address of addresses)
    console.log(`Relay phone: https://${address}:${securePort}`);
});
if (publicOrigin) console.log(`Relay public website: ${publicOrigin}`);
if (!getRtcConfig().relayConfigured)
  console.warn(
    "TURN is not configured: some different-network connections will fail. See README.md.",
  );
function shutdown() {
  pairing.close();
  http.close();
  https?.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
