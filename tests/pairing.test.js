import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createPairingService } from "../server/pairing.js";

async function setup(context, options) {
  const service = createPairingService(options);
  const server = createServer();
  const wss = service.attach(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => {
    service.close();
    wss.close();
    server.close();
  });
  async function client(options) {
    const socket = new WebSocket(
      `ws://127.0.0.1:${server.address().port}/signal`,
      options,
    );
    await once(socket, "open");
    return socket;
  }
  const receive = async (socket) => {
    const [data] = await once(socket, "message", {
      signal: AbortSignal.timeout(2000),
    });
    return JSON.parse(data.toString());
  };
  const send = (socket, message) => socket.send(JSON.stringify(message));
  return { client, receive, send };
}

test("pairs six-digit codes, relays signaling and cleans up both peers", async (context) => {
  const { client, receive, send } = await setup(context);
  const host = await client();
  const phone = await client();
  send(host, { type: "create" });
  const room = await receive(host);
  assert.match(room.code, /^\d{6}$/);
  const joined = receive(host);
  send(phone, { type: "join", code: room.code });
  assert.equal((await receive(phone)).type, "joined");
  assert.equal((await joined).type, "peer-joined");
  send(host, { type: "offer", payload: { sdp: "test-offer" } });
  assert.deepEqual(await receive(phone), {
    type: "offer",
    payload: { sdp: "test-offer" },
  });
  send(phone, { type: "answer", payload: { sdp: "test-answer" } });
  assert.equal((await receive(host)).payload.sdp, "test-answer");
  send(phone, { type: "leave" });
  assert.equal((await receive(host)).type, "peer-left");
  const rejoined = receive(host);
  send(phone, { type: "join", code: room.code });
  assert.equal((await receive(phone)).type, "joined");
  await rejoined;
  send(host, { type: "leave" });
  assert.equal((await receive(phone)).type, "ended");
  send(phone, { type: "join", code: room.code });
  assert.equal((await receive(phone)).type, "error");
});

test("accepts the configured public origin behind a proxy and rejects foreign origins", async (context) => {
  const { client, receive, send } = await setup(context, {
    allowedOrigins: ["https://relay.example"],
  });
  const host = await client({ origin: "https://relay.example" });
  send(host, { type: "create" });
  assert.equal((await receive(host)).type, "created");
  const foreign = await client({ origin: "https://foreign.example" });
  const [code] = await once(foreign, "close", {
    signal: AbortSignal.timeout(2000),
  });
  assert.equal(code, 1008);
});

test("rate limits guesses across reconnected sockets", async (context) => {
  const { client, receive, send } = await setup(context, { maxAttempts: 1 });
  const first = await client();
  send(first, { type: "join", code: "000000" });
  assert.match((await receive(first)).message, /not found/);
  first.terminate();
  const second = await client();
  send(second, { type: "join", code: "000000" });
  assert.match((await receive(second)).message, /Too many/);
});

test("rejects invalid codes and a second viewer", async (context) => {
  const { client, receive, send } = await setup(context);
  const host = await client();
  const phone = await client();
  const other = await client();
  send(phone, { type: "join", code: "123" });
  assert.equal((await receive(phone)).type, "error");
  send(host, { type: "create" });
  const { code } = await receive(host);
  const joined = receive(host);
  send(phone, { type: "join", code });
  await receive(phone);
  await joined;
  send(other, { type: "join", code });
  assert.match((await receive(other)).message, /already/);
});

test("expires codes and rate limits guesses", async (context) => {
  const { client, receive, send } = await setup(context, {
    ttl: -1,
    maxAttempts: 2,
  });
  const host = await client();
  const phone = await client();
  send(host, { type: "create" });
  const { code } = await receive(host);
  send(phone, { type: "join", code });
  assert.match((await receive(phone)).message, /expired/);
  send(phone, { type: "join", code: "123456" });
  await receive(phone);
  send(phone, { type: "join", code: "123456" });
  assert.match((await receive(phone)).message, /Too many/);
});

test("cleans up abruptly disconnected viewers and hosts", async (context) => {
  const { client, receive, send } = await setup(context);
  const host = await client();
  const phone = await client();
  send(host, { type: "create" });
  const { code } = await receive(host);
  const paired = receive(host);
  send(phone, { type: "join", code });
  await receive(phone);
  await paired;
  const left = receive(host);
  phone.terminate();
  assert.equal((await left).type, "peer-left");
  const replacement = await client();
  const rejoined = receive(host);
  send(replacement, { type: "join", code });
  assert.equal((await receive(replacement)).type, "joined");
  await rejoined;
  const ended = receive(replacement);
  host.terminate();
  assert.equal((await ended).type, "ended");
  send(replacement, { type: "join", code });
  assert.equal((await receive(replacement)).type, "error");
});

test("groups admit multiple members, relay targeted messages and survive creator departure", async (context) => {
  const { client, receive, send } = await setup(context);
  const creator = await client();
  const second = await client();
  const third = await client();
  send(creator, { type: "group-create", name: "Creator" });
  const created = await receive(creator);
  assert.match(created.code, /^\d{6}$/);
  const creatorNotice = receive(creator);
  send(second, { type: "group-join", code: created.code, name: "Second" });
  const joined = await receive(second);
  assert.deepEqual(joined.members, [
    { id: created.selfId, name: "Creator", muted: true, sharing: false },
  ]);
  await creatorNotice;
  const creatorThird = receive(creator);
  const secondThird = receive(second);
  send(third, { type: "group-join", code: created.code, name: "Third" });
  const thirdJoined = await receive(third);
  assert.equal(thirdJoined.members.length, 2);
  await creatorThird;
  await secondThird;
  const creatorMedia = receive(creator);
  const thirdMedia = receive(third);
  send(second, { type: "group-media", muted: false, sharing: true });
  assert.deepEqual(await thirdMedia, {
    type: "group-member-media",
    id: joined.selfId,
    name: "Second",
    muted: false,
    sharing: true,
  });
  await creatorMedia;
  send(second, {
    type: "group-signal",
    to: thirdJoined.selfId,
    from: "spoof",
    kind: "offer",
    payload: { sdp: "group-offer" },
  });
  assert.deepEqual(await receive(third), {
    type: "group-signal",
    from: joined.selfId,
    kind: "offer",
    payload: { sdp: "group-offer" },
  });
  const secondLeft = receive(second);
  const thirdLeft = receive(third);
  creator.terminate();
  assert.equal((await secondLeft).id, created.selfId);
  await thirdLeft;
  send(second, {
    type: "group-signal",
    to: thirdJoined.selfId,
    kind: "ice",
    payload: { candidate: "test" },
  });
  assert.equal((await receive(third)).kind, "ice");
  const thirdSawLeave = receive(third);
  send(second, { type: "leave" });
  await thirdSawLeave;
  send(third, { type: "leave" });
  send(third, { type: "group-join", code: created.code });
  assert.match((await receive(third)).message, /not found/);
});

test("group codes are isolated from paired sessions and enforce capacity", async (context) => {
  const { client, receive, send } = await setup(context, {
    maxGroupMembers: 2,
  });
  const creator = await client();
  const member = await client();
  const extra = await client();
  send(creator, { type: "group-create", name: "Name".repeat(30) });
  const { code } = await receive(creator);
  send(extra, { type: "join", code });
  assert.equal((await receive(extra)).type, "error");
  const noticed = receive(creator);
  send(member, { type: "group-join", code });
  const joined = await receive(member);
  assert.equal(joined.members[0].name.length, 40);
  await noticed;
  send(extra, { type: "group-join", code });
  assert.match((await receive(extra)).message, /full/);
  send(member, { type: "create" });
  assert.match((await receive(member)).message, /Leave/);
});
