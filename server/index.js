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
app.get("/api/media/search", async (request, response) => {
  const kind = request.query.kind === "audio" ? "audio" : request.query.kind === "video" ? "video" : "";
  const query = typeof request.query.q === "string" ? request.query.q.trim().slice(0, 100) : "";
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!kind || !query) return response.status(400).json({ error: "Choose audio or video and enter a search." });
  if (!apiKey) return response.status(503).json({ error: "YouTube search is not configured. Add YOUTUBE_API_KEY to the server environment." });
  const cacheKey = `${kind}:${query.toLowerCase()}`;
  const cached = mediaSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return response.json({ items: cached.items });
  if (cached) mediaSearchCache.delete(cacheKey);
  const params = new URLSearchParams({ key: apiKey, part: "snippet", type: "video", maxResults: "12", order: "relevance", videoEmbeddable: "true", q: query });
  try {
    const result = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    const data = await result.json();
    if (!result.ok) return response.status(502).json({ error: data.error?.message || "YouTube search failed." });
    const items = (data.items || []).filter((item) => item.id?.videoId).map((item) => ({ videoId: item.id.videoId, title: item.snippet?.title || "Untitled video", channel: item.snippet?.channelTitle || "YouTube", thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "" }));
    mediaSearchCache.set(cacheKey, { items, expiresAt: Date.now() + 5 * 60_000 });
    while (mediaSearchCache.size > 100) mediaSearchCache.delete(mediaSearchCache.keys().next().value);
    response.set("Cache-Control", "private, max-age=120");
    return response.json({ items });
  } catch {
    return response.status(502).json({ error: "Could not reach YouTube search right now." });
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
