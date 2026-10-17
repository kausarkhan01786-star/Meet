import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";

test(
  "production publishes the public address and fresh TURN settings without local HTTPS",
  { timeout: 15000 },
  async (context) => {
    const child = spawn(process.execPath, ["server/index.js", "--production"], {
      cwd: new URL("../", import.meta.url),
      env: {
        ...process.env,
        PORT: "0",
        LOCAL_HTTPS: "false",
        PUBLIC_URL: "https://relay.example",
        TURN_URLS: "turns:relay.example:443?transport=tcp",
        TURN_SECRET: "smoke-test-secret",
        ICE_RELAY_ONLY: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    context.after(async () => {
      if (child.exitCode === null) {
        const exited = once(child, "exit");
        child.kill();
        await exited;
      }
    });
    const base = await new Promise((resolve, reject) => {
      let output = "";
      child.stdout.on("data", (data) => {
        output += data;
        const address = output.match(/Relay PC: http:\/\/localhost:(\d+)/);
        if (address) resolve(`http://127.0.0.1:${address[1]}`);
      });
      child.once("error", reject);
      child.once("exit", (code) =>
        reject(new Error(`Server exited with code ${code}`)),
      );
    });
    const health = await fetch(`${base}/healthz`);
    assert.deepEqual(await health.json(), { status: "ok" });
    const network = await (await fetch(`${base}/api/network`)).json();
    assert.deepEqual(network.urls, ["https://relay.example"]);
    assert.equal(network.mode, "internet");
    assert.equal(network.relayConfigured, true);
    const configResponse = await fetch(`${base}/api/rtc-config`);
    assert.equal(configResponse.headers.get("cache-control"), "no-store");
    const config = await configResponse.json();
    assert.equal(config.iceTransportPolicy, "relay");
    assert.equal(
      config.iceServers[1].urls[0],
      "turns:relay.example:443?transport=tcp",
    );
    assert.equal(JSON.stringify(config).includes("smoke-test-secret"), false);
  },
);
