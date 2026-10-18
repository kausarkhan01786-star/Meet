import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { availableParallelism, cpus, totalmem } from "node:os";
import { fileURLToPath } from "node:url";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { WebSocket } from "ws";
import { createPairingService } from "../server/pairing.js";

const round = (value) => Math.round(value * 100) / 100;
const mib = (bytes) => round(bytes / 1024 / 1024);

async function worker() {
  const service = createPairingService({ trustProxy: process.env.LOAD_TEST_PROXY === "true" });
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
  });
  const wss = service.attach(server);
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  const baseline = process.memoryUsage();
  const started = performance.now();
  const baselineCpu = process.cpuUsage();
  let peakRss = baseline.rss;
  let peakHeap = baseline.heapUsed;
  let peakCpu = 0;
  let previousCpu = process.cpuUsage();
  let previousTime = performance.now();
  const sampler = setInterval(() => {
    const memory = process.memoryUsage();
    peakRss = Math.max(peakRss, memory.rss);
    peakHeap = Math.max(peakHeap, memory.heapUsed);
    const currentCpu = process.cpuUsage();
    const currentTime = performance.now();
    peakCpu = Math.max(peakCpu, ((currentCpu.user - previousCpu.user + currentCpu.system - previousCpu.system) / 1000) / (currentTime - previousTime) * 100);
    previousCpu = currentCpu;
    previousTime = currentTime;
  }, 100);
  const snapshot = () => {
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    return {
      baselineRssMiB: mib(baseline.rss),
      rssMiB: mib(memory.rss),
      peakRssMiB: mib(Math.max(peakRss, memory.rss)),
      peakHeapMiB: mib(Math.max(peakHeap, memory.heapUsed)),
      cpuMs: round((cpu.user - baselineCpu.user + cpu.system - baselineCpu.system) / 1000),
      averageCpuPercent: round((cpu.user - baselineCpu.user + cpu.system - baselineCpu.system) / 1000 / (performance.now() - started) * 100),
      observedPeakCpuPercent: round(peakCpu),
      eventLoopP95Ms: round(delay.percentile(95) / 1e6),
      eventLoopMaxMs: round(delay.max / 1e6),
      activeSockets: wss.clients.size,
    };
  };
  process.on("message", async (message) => {
    if (message.type === "metrics") {
      if (message.waitForEmpty && wss.clients.size) {
        let timer;
        try {
          await Promise.race([
            Promise.all([...wss.clients].filter((socket) => socket.readyState !== WebSocket.CLOSED).map((socket) => once(socket, "close").catch(() => {}))),
            new Promise((resolve) => { timer = setTimeout(resolve, 5000); }),
          ]);
        } finally { clearTimeout(timer); }
      }
      process.send({ type: "metrics", id: message.id, ...snapshot() });
    }
    if (message.type === "stop") {
      clearInterval(sampler);
      delay.disable();
      service.close();
      wss.close();
      server.close(() => process.exit(0));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  process.send({ type: "ready", port: server.address().port, pid: process.pid });
}

function distribution(values) {
  const sorted = [...values].sort((first, second) => first - second);
  const percentile = (fraction) => sorted.length ? round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]) : null;
  return { count: sorted.length, p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99), maxMs: sorted.length ? round(sorted.at(-1)) : null };
}

async function startWorker(proxy) {
  const child = fork(fileURLToPath(import.meta.url), ["--worker"], {
    env: { ...process.env, LOAD_TEST_PROXY: String(proxy) },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let stderr = "";
  child.stderr.on("data", (data) => { stderr += data.toString(); });
  function receive(predicate, timeout = 15_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error("Worker response timed out")), timeout);
      const message = (value) => { if (predicate(value)) finish(null, value); };
      const exit = (code) => finish(new Error(`Load-test server exited (${code}): ${stderr.slice(-1000)}`));
      function finish(error, value) {
        clearTimeout(timer);
        child.off("message", message);
        child.off("exit", exit);
        if (error) reject(error); else resolve(value);
      }
      child.on("message", message);
      child.on("exit", exit);
    });
  }
  const ready = await receive((message) => message.type === "ready");
  return {
    port: ready.port,
    async metrics(waitForEmpty = false) {
      const id = performance.now();
      const result = receive((message) => message.type === "metrics" && message.id === id);
      child.send({ type: "metrics", id, waitForEmpty });
      return result;
    },
    async stop() {
      if (child.exitCode !== null) return;
      const exited = once(child, "exit");
      child.send({ type: "stop" });
      const force = setTimeout(() => child.kill(), 5000);
      await exited;
      clearTimeout(force);
    },
  };
}

class Client {
  constructor(port, index, proxy) {
    this.index = index;
    this.name = `Load user ${String(index + 1).padStart(2, "0")}`;
    this.waiters = new Set();
    this.received = {};
    this.bytesReceived = 0;
    this.errors = [];
    this.id = null;
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/signal`, proxy ? { headers: { "x-forwarded-for": `198.51.100.${index + 1}` } } : {});
    this.socket.on("error", () => {});
    this.socket.on("message", (data) => {
      this.bytesReceived += data.length;
      const message = JSON.parse(data.toString());
      this.received[message.type] = (this.received[message.type] || 0) + 1;
      if (message.type === "error") this.errors.push(message.message);
      for (const waiter of [...this.waiters]) {
        if (waiter.predicate(message)) waiter.finish(null, message);
      }
    });
    this.socket.on("close", () => {
      for (const waiter of [...this.waiters]) waiter.finish(new Error(`Client ${this.index} closed before response`));
    });
  }
  expect(predicate, timeout = 15_000) {
    return new Promise((resolve, reject) => {
      const waiter = { predicate, finish: (error, message) => {
        clearTimeout(timer);
        this.waiters.delete(waiter);
        if (error) reject(error); else resolve(message);
      } };
      const timer = setTimeout(() => waiter.finish(new Error(`Client ${this.index} timed out`)), timeout);
      this.waiters.add(waiter);
    });
  }
  send(message) { this.socket.send(JSON.stringify(message)); }
  async enter(type, code) {
    const response = this.expect((message) => ["group-joined", "error", "group-admission-pending"].includes(message.type));
    const started = performance.now();
    this.send({ type, name: this.name, meetingType: "group", clientId: `load-client-${this.index}`, ...(code ? { code } : {}) });
    const message = await response;
    if (message.type === "group-joined") { this.id = message.selfId; this.code = message.code; }
    return { message, duration: performance.now() - started };
  }
  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    const closed = once(this.socket, "close");
    this.socket.close();
    const timer = setTimeout(() => this.socket.terminate(), 3000);
    await closed;
    clearTimeout(timer);
  }
}

async function concurrentMap(items, concurrency, task) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) { const index = next++; await task(items[index], index); }
  }));
}

async function scenario({ name, clientsCount, roomSize, proxy, rounds }) {
  const server = await startWorker(proxy);
  const clients = [];
  const started = performance.now();
  const connectionTimes = [];
  const joinTimes = [];
  const relayTimes = [];
  const chatTimes = [];
  const controlTimes = [];
  const healthTimes = [];
  const groups = [];
  const rejected = [];
  let publishedLimit;
  let signalCount = 0;
  let publishedChats = 0;
  try {
    await Promise.all(Array.from({ length: clientsCount }, async (_, index) => {
      const time = performance.now();
      const client = new Client(server.port, index, proxy);
      clients[index] = client;
      await once(client.socket, "open");
      connectionTimes.push(performance.now() - time);
    }));
    console.log(`[${name}] ${clientsCount} WebSocket connections opened`);
    for (let offset = 0; offset < clients.length; offset += roomSize) {
      const candidates = clients.slice(offset, offset + roomSize);
      const owner = candidates[0];
      const created = await owner.enter("group-create");
      if (created.message.type !== "group-joined") { rejected.push(created.message.message); continue; }
      publishedLimit = created.message.limit;
      joinTimes.push(created.duration);
      const group = { code: owner.code, owner, members: [owner] };
      groups.push(group);
      await Promise.all(candidates.slice(1).map(async (client) => {
        const result = await client.enter("group-join", owner.code);
        if (result.message.type === "group-joined") { group.members.push(client); joinTimes.push(result.duration); }
        else rejected.push(result.message.message || result.message.type);
      }));
    }
    const joined = groups.reduce((count, group) => count + group.members.length, 0);
    const membershipMs = round(performance.now() - started);
    console.log(`[${name}] ${joined} joined, ${rejected.length} rejected`);
    if (proxy) {
      assert.equal(joined, clientsCount, "Every distributed client must join");
      const pairs = groups.flatMap((group) => group.members.flatMap((sender, index) => group.members.slice(index + 1).map((receiver) => ({ sender, receiver }))));
      const relay = async (sender, receiver, kind, token) => {
        const delivered = receiver.expect((message) => message.type === "group-signal" && message.payload?.loadToken === token);
        const time = performance.now();
        sender.send({ type: "group-signal", to: receiver.id, kind, payload: { loadToken: token, candidate: kind === "ice" ? "candidate:load-test" : undefined, sdp: kind !== "ice" ? "synthetic-signaling-only:" + "x".repeat(950) : undefined } });
        const result = await delivered;
        assert.equal(result.from, sender.id);
        relayTimes.push(performance.now() - time);
        signalCount++;
      };
      await concurrentMap(pairs, 60, async ({ sender, receiver }, index) => {
        await relay(sender, receiver, "offer", `offer-${index}`);
        await relay(receiver, sender, "answer", `answer-${index}`);
        for (let candidate = 0; candidate < 3; candidate++) {
          await relay(sender, receiver, "ice", `ice-out-${index}-${candidate}`);
          await relay(receiver, sender, "ice", `ice-in-${index}-${candidate}`);
        }
      });
      console.log(`[${name}] ${signalCount} synthetic signaling messages delivered`);
      const chatRound = async (index) => {
        await Promise.all(groups.flatMap((group) => group.members.map(async (sender) => {
          const text = (`load-${index}-${sender.index}: ` + "meeting ".repeat(20)).trim();
          const deliveries = group.members.map((receiver) => receiver.expect((message) => message.type === "group-chat" && message.senderId === sender.id && message.text === text));
          const time = performance.now();
          sender.send({ type: "group-chat", text });
          await Promise.all(deliveries);
          chatTimes.push(performance.now() - time);
          publishedChats++;
        })));
        const healthStarted = performance.now();
        const health = await fetch(`http://127.0.0.1:${server.port}/healthz`);
        assert.equal(health.status, 200);
        healthTimes.push(performance.now() - healthStarted);
        if (index === 0) {
          await Promise.all(groups.flatMap((group) => group.members.slice(0, Math.min(5, group.members.length)).map(async (member) => {
            const deliveries = group.members.map((receiver) => receiver.expect((message) => message.type === "group-state" && message.members.some((entry) => entry.id === member.id && entry.handRaised)));
            const time = performance.now();
            member.send({ type: "group-hand", raised: true });
            await Promise.all(deliveries);
            controlTimes.push(performance.now() - time);
          })));
        }
      };
      let tick = 0;
      const workload = [];
      await new Promise((resolve, reject) => {
        const timer = setInterval(() => {
          const current = tick++;
          const work = chatRound(current);
          work.catch(() => {});
          workload.push(work);
          console.log(`[${name}] traffic round ${tick}/${rounds}`);
          if (tick >= rounds) { clearInterval(timer); Promise.all(workload).then(resolve, reject); }
        }, 1000);
      });
      for (const group of groups) {
        const states = group.members.map((client) => client.expect((message) => message.type === "group-state" && message.muteAllLocked));
        const time = performance.now();
        group.owner.send({ type: "group-admin", action: "mute-all" });
        await Promise.all(states);
        controlTimes.push(performance.now() - time);
      }
    }
    const activeMetrics = await server.metrics();
    const messagesByType = {};
    for (const client of clients) for (const [type, count] of Object.entries(client.received)) messagesByType[type] = (messagesByType[type] || 0) + count;
    const deliveredMiB = mib(clients.reduce((count, client) => count + client.bytesReceived, 0));
    await Promise.all(clients.map((client) => client.close()));
    const cleanupMetrics = await server.metrics(true);
    assert.equal(cleanupMetrics.activeSockets, 0, "Closed clients must not remain in the server");
    let emptyRoomCleanup = "not probed: same-IP rate limiter intentionally active";
    if (proxy) {
      const probe = new Client(server.port, 200, true);
      clients.push(probe);
      await once(probe.socket, "open");
      for (const group of groups) {
        const result = await probe.enter("group-join", group.code);
        assert.equal(result.message.type, "error");
        assert.match(result.message.message, /not found/i);
      }
      await probe.close();
      emptyRoomCleanup = "passed";
    }
    return {
      name,
      simulatedUsers: clientsCount,
      joined,
      rejected: rejected.length,
      rejectionReasons: Object.fromEntries([...new Set(rejected)].map((reason) => [reason, rejected.filter((value) => value === reason).length])),
      rooms: groups.length,
      publishedRoomLimit: publishedLimit,
      admissionBurstMs: membershipMs,
      connections: distribution(connectionTimes),
      joins: distribution(joinTimes),
      syntheticSignals: signalCount,
      relayLatency: distribution(relayTimes),
      publishedChats,
      chatBroadcastLatency: distribution(chatTimes),
      controlBroadcastLatency: distribution(controlTimes),
      healthLatency: distribution(healthTimes),
      observedDeliveredMessages: messagesByType,
      observedDeliveredMiB: deliveredMiB,
      server: activeMetrics,
      socketCleanup: cleanupMetrics.activeSockets === 0,
      emptyRoomCleanup,
      durationSeconds: round((performance.now() - started) / 1000),
      unexpectedErrors: proxy ? clients.flatMap((client) => client.errors).filter((error) => !/not found/i.test(error)) : [],
    };
  } finally {
    await Promise.allSettled(clients.map((client) => client.close()));
    await server.stop();
  }
}

async function main() {
  const total = Number(process.argv[2] || 50);
  const rounds = Number(process.argv[3] || 10);
  if (!Number.isInteger(total) || total < 2 || total > 100 || !Number.isInteger(rounds) || rounds < 2 || rounds > 20) throw new Error("Usage: node scripts/load-test.mjs [clients:2-100] [rounds:2-20]");
  const results = [];
  for (const options of [
    { name: "same-ip-default-rate-limit", roomSize: total, proxy: false, rounds: 0 },
    { name: "one-room-distributed-users", roomSize: total, proxy: true, rounds },
    { name: "multiple-rooms-distributed-users", roomSize: 5, proxy: true, rounds },
  ]) {
    console.log(`Running ${options.name} with ${total} local simulated clients...`);
    const result = await scenario({ ...options, clientsCount: total });
    results.push(result);
    console.log(JSON.stringify(result, null, 2));
  }
  console.log(JSON.stringify({
    testedAt: new Date().toISOString(),
    node: process.version,
    machine: { cpu: cpus()[0]?.model, parallelism: availableParallelism(), memoryGiB: round(totalmem() / 1024 ** 3) },
    scope: "Isolated local production signaling service in separate Node workers. Simulated trusted-proxy IPs are test-only. No browser media, TURN relay bandwidth, Railway capacity, or real WebRTC negotiation is measured.",
    meshAtThisSize: { peersPerBrowser: total - 1, peerPairs: total * (total - 1) / 2 },
    casesPassed: results.filter((result) => result.socketCleanup && !result.unexpectedErrors.length).length,
  }, null, 2));
}

if (process.argv.includes("--worker")) await worker();
else await main().catch((error) => { console.error(error); process.exitCode = 1; });