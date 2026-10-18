import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once, on } from "node:events";
import { WebSocket } from "ws";
import { createPairingService } from "../server/pairing.js";
import { parseChatContent } from "../shared/meeting-content.js";

test("chat validates text and uploaded file attachments", () => {
  assert.equal(parseChatContent({ text: "Hello \u{1F44B}" }).kind, "text");
  assert.deepEqual(parseChatContent({ kind: "file", fileName: "notes.txt", mimeType: "text/plain", data: "data:text/plain;base64,aGVsbG8=" }), { kind: "file", fileName: "notes.txt", mimeType: "text/plain", data: "data:text/plain;base64,aGVsbG8=" });
  assert.throws(() => parseChatContent({ kind: "sticker", stickerId: "great" }), /Unsupported/);
  assert.throws(() => parseChatContent({ kind: "file", fileName: "bad.bin", mimeType: "application/octet-stream", data: "javascript:alert(1)" }), /file/i);
});

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
    socket.testInbox = on(socket, "message", { close: ["close"] });
    await once(socket, "open");
    return socket;
  }
  const receive = async (socket) => {
    let timer;
    try {
      const result = await Promise.race([socket.testInbox.next(), new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error("Timed out waiting for a signaling message")), 2000); })]);
      if (result.done) throw new Error("Socket closed while awaiting a signaling message");
      return JSON.parse(result.value[0].toString());
    } finally { clearTimeout(timer); }
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
    {
      id: created.selfId,
      name: "Creator",
      muted: true,
      sharing: false,
      camera: false,
      role: "owner",
      permissions: { microphone: true, camera: true, screen: true },
      micLocked: false,
      handRaised: false,
    },
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
  send(second, {
    type: "group-media",
    muted: false,
    sharing: true,
    camera: true,
    role: "member",
    permissions: { microphone: true, camera: true, screen: true },
    micLocked: false,
    handRaised: false,
  });
  assert.deepEqual(await thirdMedia, {
    type: "group-member-media",
    id: joined.selfId,
    name: "Second",
    muted: false,
    sharing: true,
    camera: true,
    role: "member",
    permissions: { microphone: true, camera: true, screen: true },
    handRaised: false,
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
  await receive(second);
  await receive(third);
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
  await receive(third);
  send(third, { type: "leave" });
  send(third, { type: "group-join", code: created.code, name: "Third" });
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
  send(member, { type: "group-join", code, name: "Member" });
  const joined = await receive(member);
  assert.equal(joined.members[0].name.length, 40);
  await noticed;
  send(extra, { type: "group-join", code, name: "Extra" });
  assert.match((await receive(extra)).message, /full/);
  send(member, { type: "create" });
  assert.match((await receive(member)).message, /Leave/);
});

test("late joiners receive camera status without replacing screen-sharing status", async (context) => {
  const { client, receive, send } = await setup(context);
  const host = await client();
  const guest = await client();
  send(host, { type: "group-create", name: "Host" });
  const { code } = await receive(host);
  send(host, {
    type: "group-media",
    muted: false,
    sharing: true,
    camera: true,
  });
  const noticed = receive(host);
  send(guest, { type: "group-join", code, name: "Guest" });
  const room = await receive(guest);
  assert.equal(room.members[0].camera, true);
  assert.equal(room.members[0].sharing, true);
  await noticed;
  send(host, {
    type: "group-media",
    muted: false,
    sharing: true,
    camera: false,
  });
  const update = await receive(guest);
  assert.equal(update.camera, false);
  assert.equal(update.sharing, true);
});

test("single meetings accept only two members and reject mismatched meeting types", async (context) => {
  const { client, receive, send } = await setup(context);
  const host = await client();
  const receiver = await client();
  const extra = await client();
  send(host, { type: "group-create", name: "Host", meetingType: "single" });
  const created = await receive(host);
  assert.equal(created.limit, 2);
  assert.equal(created.meetingType, "single");
  send(extra, {
    type: "group-join",
    code: created.code,
    meetingType: "group",
    name: "Extra",
  });
  assert.match((await receive(extra)).message, /different meeting type/);
  const noticed = receive(host);
  send(receiver, {
    type: "group-join",
    code: created.code,
    meetingType: "single",
    name: "Receiver",
  });
  assert.equal((await receive(receiver)).members.length, 1);
  await noticed;
  send(extra, {
    type: "group-join",
    code: created.code,
    meetingType: "single",
    name: "Extra",
  });
  assert.match((await receive(extra)).message, /full/);
});

test("meeting chat uses trusted sender identity, stays room-scoped and limits messages", async (context) => {
  const { client, receive, send } = await setup(context);
  const host = await client();
  const member = await client();
  const outsider = await client();
  send(host, { type: "group-create", name: "Host" });
  const room = await receive(host);
  const noticed = receive(host);
  send(member, { type: "group-join", code: room.code, name: "Member" });
  const joined = await receive(member);
  await noticed;
  send(outsider, { type: "group-chat", code: room.code, text: "Unauthorized" });
  const echo = receive(member);
  send(member, {
    type: "group-chat",
    senderId: "spoof",
    name: "Spoof",
    text: "  Hello meeting  ",
  });
  const message = await receive(host);
  assert.equal(message.type, "group-chat");
  assert.equal(message.text, "Hello meeting");
  assert.equal(message.name, "Member");
  assert.equal(message.senderId, joined.selfId);
  assert.equal(typeof message.sentAt, "number");
  assert.equal((await echo).id, message.id);
  const hostFileDelivery = [receive(host), receive(host), receive(host)];
  const memberFileDelivery = [receive(member), receive(member), receive(member)];
  send(member, { type: "group-chat", kind: "file", fileName: "hello.txt", mimeType: "text/plain", data: "data:text/plain;base64,aGVsbG8=" });
  const [hostStart, hostChunk, hostEnd] = await Promise.all(hostFileDelivery);
  await Promise.all(memberFileDelivery);
  assert.equal(hostStart.type, "group-file-delivery-start");
  assert.equal(hostStart.fileName, "hello.txt");
  assert.equal(hostChunk.data, "aGVsbG8=");
  assert.equal(hostEnd.type, "group-file-delivery-end");
  send(member, { type: "group-chat", text: "x".repeat(2001) });
  assert.match((await receive(member)).message, /2000/);
  for (let index = 2; index < 20; index++) {
    const delivered = receive(host);
    send(member, { type: "group-chat", text: `Message ${index}` });
    await receive(member);
    await delivered;
  }
  send(member, { type: "group-chat", text: "Too many" });
  assert.match((await receive(member)).message, /wait a moment/);
});

test("meeting create and join require a nonblank name and trim accepted names", async (context) => {
  const { client, receive, send } = await setup(context, { maxAttempts: 100 });
  const host = await client();
  const guest = await client();
  send(host, { type: "group-create", name: "Host" });
  const { code } = await receive(host);
  for (const name of [undefined, null, "", "   ", "\t\n", 42]) {
    for (const type of ["group-create", "group-join"]) {
      send(guest, { type, code, name });
      assert.match((await receive(guest)).message, /Enter your name/);
    }
  }
  const noticed = receive(host);
  send(guest, { type: "group-join", code, name: "  Kausar mia  " });
  assert.equal((await receive(guest)).type, "group-joined");
  assert.equal((await noticed).member.name, "Kausar mia");
});

test("only authorized admins can manage chat, permissions, roles and removal", async (context) => {
  const { client, receive, send } = await setup(context);
  const owner = await client();
  const admin = await client();
  const member = await client();
  send(owner, { type: "group-create", name: "Owner" });
  const created = await receive(owner);
  assert.equal(created.self.role, "owner");
  assert.equal(created.self.handRaised, false);
  send(admin, { type: "group-join", code: created.code, name: "Admin" });
  const adminJoined = await receive(admin);
  await receive(owner);
  send(member, { type: "group-join", code: created.code, name: "Member" });
  const memberJoined = await receive(member);
  await receive(owner);
  await receive(admin);
  const allState = async () => Promise.all([owner, admin, member].map(receive));
  send(member, { type: "group-admin", action: "chat", enabled: false });
  assert.match((await receive(member)).message, /Only meeting admins/);
  send(owner, { type: "group-admin", action: "role", targetId: adminJoined.selfId, role: "admin" });
  assert.equal((await allState())[1].members.find((entry) => entry.id === adminJoined.selfId).role, "admin");
  send(admin, { type: "group-admin", action: "remove", targetId: created.selfId });
  assert.match((await receive(admin)).message, /higher or equal role/);
  send(admin, { type: "group-admin", action: "chat", enabled: false });
  assert.ok((await allState()).every((state) => state.chatEnabled === false));
  send(member, { type: "group-chat", text: "Blocked message" });
  assert.match((await receive(member)).message, /Chat is disabled/);
  send(admin, { type: "group-admin", action: "permission", targetId: memberJoined.selfId, permission: "microphone", allowed: false });
  assert.ok((await allState()).every((state) => state.members.find((entry) => entry.id === memberJoined.selfId).permissions.microphone === false));
  send(member, { type: "group-media", muted: false, sharing: false, camera: false });
  assert.equal((await receive(owner)).muted, true);
  await receive(admin);
  send(member, { type: "group-hand", raised: true });
  assert.ok((await allState()).every((state) => state.members.find((entry) => entry.id === memberJoined.selfId).handRaised));
  send(member, { type: "group-hand", raised: false });
  assert.ok((await allState()).every((state) => !state.members.find((entry) => entry.id === memberJoined.selfId).handRaised));
  send(admin, { type: "group-admin", action: "mute-all" });
  assert.equal((await receive(member)).type, "group-force-mute");
  const mutedState = await allState();
  assert.ok(mutedState.every((state) => state.members.find((entry) => entry.id === memberJoined.selfId).micLocked));
  send(owner, { type: "group-admin", action: "unmute-all" });
  const unlockedState = await allState();
  assert.ok(unlockedState.every((state) => !state.members.find((entry) => entry.id === memberJoined.selfId).micLocked));
  send(admin, { type: "group-admin", action: "remove", targetId: memberJoined.selfId });
  assert.equal((await receive(member)).type, "group-removed");
  assert.equal((await receive(owner)).type, "group-member-left");
  await receive(owner);
  await receive(admin);
  await receive(admin);
  send(member, { type: "group-create", name: "New meeting" });
  assert.equal((await receive(member)).type, "group-joined");
});
