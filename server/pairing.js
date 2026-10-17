import { randomInt, randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

export function createPairingService({
  ttl = 600_000,
  maxAttempts = 12,
  allowedOrigins = [],
  trustProxy = false,
  maxGroupMembers = 6,
} = {}) {
  const rooms = new Map();
  const groups = new Map();
  const sockets = new Set();
  const attemptsByAddress = new Map();
  const send = (socket, message) => {
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(message));
  };
  const memberInfo = (socket) => ({
    id: socket.memberId,
    name: socket.memberName,
    muted: socket.groupMuted ?? true,
    sharing: Boolean(socket.groupSharing),
    camera: Boolean(socket.groupCamera),
  });
  const broadcastGroup = (group, message, exclude) => {
    for (const member of group.members.values()) {
      if (member !== exclude) send(member, message);
    }
  };
  function allowAttempt(socket) {
    const recent = (attemptsByAddress.get(socket.address) || []).filter(
      (time) => time > Date.now() - 60_000,
    );
    if (
      recent.length >= maxAttempts ||
      (!attemptsByAddress.has(socket.address) &&
        attemptsByAddress.size >= 10_000)
    ) {
      send(socket, {
        type: "error",
        message: "Too many attempts. Try again in a minute.",
      });
      return false;
    }
    recent.push(Date.now());
    attemptsByAddress.set(socket.address, recent);
    return true;
  }

  function leave(socket) {
    const group = groups.get(socket.groupCode);
    if (group) {
      group.members.delete(socket.memberId);
      broadcastGroup(group, { type: "group-member-left", id: socket.memberId });
      if (!group.members.size) groups.delete(socket.groupCode);
      socket.groupCode = undefined;
      socket.memberId = undefined;
      socket.memberName = undefined;
      socket.groupMuted = undefined;
      socket.groupSharing = undefined;
      socket.groupCamera = undefined;
    }
    const room = rooms.get(socket.roomCode);
    if (!room) return;
    if (room.host === socket) {
      send(room.viewer, { type: "ended" });
      if (room.viewer) room.viewer.roomCode = undefined;
      rooms.delete(socket.roomCode);
    } else if (room.viewer === socket) {
      room.viewer = null;
      send(room.host, { type: "peer-left" });
    }
    socket.roomCode = undefined;
  }

  function attach(server) {
    const wss = new WebSocketServer({
      server,
      path: "/signal",
      maxPayload: 64 * 1024,
    });
    wss.on("connection", (socket, request) => {
      const origin = request.headers.origin;
      if (origin) {
        try {
          if (
            new URL(origin).host !== request.headers.host &&
            !allowedOrigins.includes(new URL(origin).origin)
          )
            return socket.close(1008, "Invalid origin");
        } catch {
          return socket.close(1008, "Invalid origin");
        }
      }
      sockets.add(socket);
      socket.address =
        trustProxy && typeof request.headers["x-forwarded-for"] === "string"
          ? request.headers["x-forwarded-for"].split(",").at(-1).trim()
          : request.socket.remoteAddress;
      socket.alive = true;
      socket.attempts = [];
      socket.on("pong", () => {
        socket.alive = true;
      });
      socket.on("error", () => {});
      socket.on("close", () => {
        leave(socket);
        sockets.delete(socket);
      });
      socket.on("message", (data) => {
        let message;
        try {
          message = JSON.parse(data.toString());
        } catch {
          return send(socket, { type: "error", message: "Invalid message." });
        }
        if (!message || typeof message !== "object") return;
        if (["group-create", "group-join"].includes(message.type)) {
          if (socket.roomCode || socket.groupCode)
            return send(socket, {
              type: "error",
              message: "Leave your current session first.",
            });
          if (!allowAttempt(socket)) return;
          let code = message.code;
          let group;
          if (message.type === "group-create") {
            do {
              code = String(randomInt(100000, 1000000));
            } while (rooms.has(code) || groups.has(code));
            const meetingType =
              message.meetingType === "single" ? "single" : "group";
            group = {
              members: new Map(),
              meetingType,
              limit: meetingType === "single" ? 2 : maxGroupMembers,
            };
            groups.set(code, group);
          } else {
            group =
              typeof code === "string" && /^\d{6}$/.test(code)
                ? groups.get(code)
                : null;
            if (!group)
              return send(socket, {
                type: "error",
                message: "Group not found. Check the code with a group member.",
              });
            if (
              message.meetingType &&
              message.meetingType !== group.meetingType
            )
              return send(socket, {
                type: "error",
                message: "This code belongs to a different meeting type.",
              });
            if (group.members.size >= group.limit)
              return send(socket, {
                type: "error",
                message: `This meeting is full (${group.limit} members).`,
              });
          }
          const members = [...group.members.values()].map(memberInfo);
          socket.memberId = randomUUID();
          socket.memberName =
            typeof message.name === "string"
              ? message.name.trim().slice(0, 40) || "Guest"
              : "Guest";
          socket.groupCode = code;
          group.members.set(socket.memberId, socket);
          send(socket, {
            type: "group-joined",
            code,
            selfId: socket.memberId,
            members,
            limit: group.limit,
            meetingType: group.meetingType,
          });
          broadcastGroup(
            group,
            { type: "group-member-joined", member: memberInfo(socket) },
            socket,
          );
        } else if (message.type === "group-chat") {
          const group = groups.get(socket.groupCode);
          if (!group) return;
          if (
            typeof message.text !== "string" ||
            !message.text.trim() ||
            message.text.length > 2000
          )
            return send(socket, {
              type: "error",
              message: "Messages must contain 1 to 2000 characters.",
            });
          socket.chatTimes = (socket.chatTimes || []).filter(
            (time) => time > Date.now() - 10_000,
          );
          if (socket.chatTimes.length >= 20)
            return send(socket, {
              type: "error",
              message: "Please wait a moment before sending more messages.",
            });
          socket.chatTimes.push(Date.now());
          broadcastGroup(group, {
            type: "group-chat",
            id: randomUUID(),
            senderId: socket.memberId,
            name: socket.memberName,
            text: message.text.trim(),
            sentAt: Date.now(),
          });
        } else if (message.type === "group-media") {
          const group = groups.get(socket.groupCode);
          if (
            !group ||
            typeof message.muted !== "boolean" ||
            typeof message.sharing !== "boolean" ||
            (message.camera !== undefined &&
              typeof message.camera !== "boolean")
          )
            return;
          socket.groupMuted = message.muted;
          socket.groupSharing = message.sharing;
          socket.groupCamera = message.camera === true;
          broadcastGroup(
            group,
            { type: "group-member-media", ...memberInfo(socket) },
            socket,
          );
        } else if (message.type === "group-signal") {
          const group = groups.get(socket.groupCode);
          const target = group?.members.get(message.to);
          if (
            !target ||
            target === socket ||
            !["offer", "answer", "ice"].includes(message.kind)
          )
            return;
          send(target, {
            type: "group-signal",
            from: socket.memberId,
            kind: message.kind,
            payload: message.payload,
          });
        } else if (message.type === "create") {
          if (socket.roomCode || socket.groupCode)
            return send(socket, {
              type: "error",
              message: "Leave your current session first.",
            });
          let code;
          do {
            code = String(randomInt(100000, 1000000));
          } while (rooms.has(code) || groups.has(code));
          const expiresAt = Date.now() + ttl;
          rooms.set(code, { host: socket, viewer: null, expiresAt });
          socket.roomCode = code;
          send(socket, { type: "created", code, expiresAt });
        } else if (message.type === "join") {
          if (!allowAttempt(socket)) return;
          socket.attempts = socket.attempts.filter(
            (time) => time > Date.now() - 60_000,
          );
          if (socket.attempts.length >= maxAttempts)
            return send(socket, {
              type: "error",
              message: "Too many attempts. Try again in a minute.",
            });
          socket.attempts.push(Date.now());
          if (socket.roomCode || socket.groupCode)
            return send(socket, {
              type: "error",
              message: "Leave your current session first.",
            });
          const room =
            typeof message.code === "string" && /^\d{6}$/.test(message.code)
              ? rooms.get(message.code)
              : null;
          if (!room || room.expiresAt < Date.now())
            return send(socket, {
              type: "error",
              message: "Code not found or expired. Check the code on your PC.",
            });
          if (room.viewer)
            return send(socket, {
              type: "error",
              message: "This PC already has a phone connected.",
            });
          room.viewer = socket;
          socket.roomCode = message.code;
          send(socket, { type: "joined" });
          send(room.host, { type: "peer-joined" });
        } else if (["offer", "answer", "ice"].includes(message.type)) {
          const room = rooms.get(socket.roomCode);
          if (!room) return;
          if (message.type === "offer" && socket !== room.host) return;
          if (message.type === "answer" && socket !== room.viewer) return;
          send(socket === room.host ? room.viewer : room.host, {
            type: message.type,
            payload: message.payload,
          });
        } else if (message.type === "leave") {
          leave(socket);
        }
      });
    });
    return wss;
  }

  const timer = setInterval(() => {
    for (const [address, attempts] of attemptsByAddress) {
      if (attempts.at(-1) <= Date.now() - 60_000)
        attemptsByAddress.delete(address);
    }
    for (const [code, room] of rooms) {
      if (!room.viewer && room.expiresAt < Date.now()) {
        send(room.host, { type: "expired" });
        room.host.roomCode = undefined;
        rooms.delete(code);
      }
    }
    for (const socket of sockets) {
      if (!socket.alive) {
        socket.terminate();
        continue;
      }
      socket.alive = false;
      socket.ping();
    }
  }, 15_000);
  timer.unref();

  return {
    attach,
    close() {
      clearInterval(timer);
      for (const socket of sockets) socket.terminate();
      rooms.clear();
      groups.clear();
      attemptsByAddress.clear();
    },
  };
}
