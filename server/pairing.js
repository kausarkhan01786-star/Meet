import { randomInt, randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { MAX_CHAT_FILE_BYTES, parseChatContent, REACTIONS } from "../shared/meeting-content.js";

export function createPairingService({
  ttl = 600_000,
  maxAttempts = 12,
  allowedOrigins = [],
  trustProxy = false,
  maxGroupMembers = 1000,
} = {}) {
  const rooms = new Map();
  const groups = new Map();
  const sockets = new Set();
  const attemptsByAddress = new Map();
  const send = (socket, message) => {
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(message));
  };
  const memberInfo = (socket, includeLocation = false, includeProfileImage = false) => ({
    id: socket.memberId,
    name: socket.memberName,
    ...(includeProfileImage && socket.groupProfileImage ? { profileImage: socket.groupProfileImage } : {}),
    muted: socket.groupMuted ?? true,
    sharing: Boolean(socket.groupSharing),
    camera: Boolean(socket.groupCamera),
    role: socket.groupRole || "member",
    permissions: socket.groupPermissions || { microphone: true, camera: true, screen: true },
    micLocked: Boolean(socket.groupMuteLocked),
    handRaised: Boolean(socket.groupHandRaised),
    rescueMode: Boolean(socket.groupRescueMode),
    ...(includeLocation && socket.groupLocation ? { location: socket.groupLocation } : {}),
  });
  const groupState = (group, viewer) => ({ type: "group-state", ownerId: group.ownerId, chatEnabled: group.chatEnabled, muteAllLocked: group.muteAllLocked === true, recordingAllowed: group.recordingAllowed === true, recordingParticipants: [...(group.recordingMembers?.values() || [])].map(({ id, name }) => ({ id, name })), studentAlreadySubmitted: Boolean(group.students?.has(viewer?.groupClientId)), ...(["owner", "admin"].includes(viewer?.groupRole) ? { students: [...(group.students?.values() || [])] } : {}), members: [...group.members.values()].map((member) => memberInfo(member, ["owner", "admin"].includes(viewer?.groupRole))), admissionRequests: [...group.admissionRequests.values()].map(({ id, name, requestedAt }) => ({ id, name, requestedAt })) });
  const clearFileUpload = (socket) => {
    if (!socket.groupFileUpload) return;
    clearTimeout(socket.groupFileUpload.timer);
    socket.groupFileUpload = null;
  };
  const publishGroupChat = (socket, group, input) => {
    if (!group.chatEnabled) return send(socket, { type: "error", message: "Chat is disabled by a meeting admin." });
    let content;
    try { content = parseChatContent(input); } catch (error) { return send(socket, { type: "error", message: error.message }); }
    socket.chatTimes = (socket.chatTimes || []).filter((time) => time > Date.now() - 10_000);
    if (socket.chatTimes.length >= 20) return send(socket, { type: "error", message: "Please wait a moment before sending more messages." });
    socket.chatTimes.push(Date.now());
    const message = { id: randomUUID(), senderId: socket.memberId, name: socket.memberName, ...content, sentAt: Date.now() };
    if (content.kind === "file") {
      const [, data = ""] = content.data.split(",", 2);
      const chunkSize = 32 * 1024;
      const totalChunks = Math.max(1, Math.ceil(data.length / chunkSize));
      broadcastGroup(group, { type: "group-file-delivery-start", ...Object.fromEntries(Object.entries(message).filter(([key]) => key !== "data")), totalChunks });
      for (let index = 0; index < totalChunks; index += 1) broadcastGroup(group, { type: "group-file-delivery-chunk", id: message.id, index, data: data.slice(index * chunkSize, (index + 1) * chunkSize) });
      broadcastGroup(group, { type: "group-file-delivery-end", id: message.id });
    } else {
      broadcastGroup(group, { type: "group-chat", ...message });
    }
  };
  const cancelPendingAdmission = (socket) => {
    const group = groups.get(socket.pendingAdmissionGroupCode);
    const request = group?.admissionRequests.get(socket.pendingAdmissionId);
    if (request?.socket === socket) {
      group.admissionRequests.delete(request.id);
      broadcastGroup(group, (viewer) => groupState(group, viewer));
    }
    socket.pendingAdmissionGroupCode = undefined;
    socket.pendingAdmissionId = undefined;
  };
  const broadcastGroup = (group, message, exclude) => {
    for (const member of group.members.values()) {
      if (member !== exclude) send(member, typeof message === "function" ? message(member) : message);
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
    clearFileUpload(socket);
    cancelPendingAdmission(socket);
    const group = groups.get(socket.groupCode);
    if (group) {
      group.members.delete(socket.memberId);
      group.recordingMembers?.delete(socket.memberId);
      if (group.ownerId === socket.memberId && group.members.size) {
        const successor = [...group.members.values()].find((member) => member.groupRole === "admin") || group.members.values().next().value;
        successor.groupRole = "owner";
        group.ownerId = successor.memberId;
      }
      broadcastGroup(group, { type: "group-member-left", id: socket.memberId });
      if (!group.members.size) {
        for (const request of group.admissionRequests.values()) {
          send(request.socket, { type: "group-admission-rejected", message: "The meeting ended before your request was reviewed." });
          request.socket.pendingAdmissionGroupCode = undefined;
          request.socket.pendingAdmissionId = undefined;
        }
        groups.delete(socket.groupCode);
      }
      else broadcastGroup(group, (viewer) => groupState(group, viewer));
      socket.groupCode = undefined;
      socket.memberId = undefined;
      socket.memberName = undefined;
      socket.groupMuted = undefined;
      socket.groupSharing = undefined;
      socket.groupCamera = undefined;
      socket.groupRole = undefined;
      socket.groupPermissions = undefined;
      socket.groupMuteLocked = undefined;
      socket.groupHandRaised = undefined;
      socket.groupRescueMode = undefined;
      socket.groupLocation = undefined;
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
        clearFileUpload(socket);
        cancelPendingAdmission(socket);
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
          const memberName =
            typeof message.name === "string"
              ? message.name.trim().slice(0, 40)
              : "";
          if (!memberName)
            return send(socket, {
              type: "error",
              message: "Enter your name before creating or joining a meeting.",
            });
          const profileImage = typeof message.profileImage === "string" ? message.profileImage : "";
          if (profileImage && (profileImage.length > 12_000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(profileImage)))
            return send(socket, { type: "error", message: "Profile images must be JPEG files smaller than 9 KB after processing." });
          const clientId = typeof message.clientId === "string" && /^[\w-]{8,80}$/.test(message.clientId) ? message.clientId : socket.groupClientId || randomUUID();
          socket.groupClientId = clientId;
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
              chatEnabled: true,
              muteAllLocked: false,
              recordingAllowed: false,
              recordingMembers: new Map(),
              students: new Map(),
              ownerId: null,
              blockedClientIds: new Set(),
              admissionRequests: new Map(),
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
            if (group.blockedClientIds.has(clientId)) {
              let request = [...group.admissionRequests.values()].find((entry) => entry.clientId === clientId);
              if (!request) {
                request = { id: randomUUID(), clientId, name: memberName, requestedAt: Date.now(), socket };
                group.admissionRequests.set(request.id, request);
              } else {
                request.socket = socket;
                request.name = memberName;
              }
              socket.pendingAdmissionGroupCode = code;
              socket.pendingAdmissionId = request.id;
              send(socket, { type: "group-admission-pending", requestId: request.id, name: memberName });
              broadcastGroup(group, (viewer) => groupState(group, viewer));
              return;
            }
            if (group.members.size >= group.limit)
              return send(socket, {
                type: "error",
                message: `This meeting is full (${group.limit} members).`,
              });
          }
          const members = [...group.members.values()].map(memberInfo);
          socket.memberId = randomUUID();
          socket.memberName = memberName;
          socket.groupProfileImage = profileImage;
          socket.groupRole = message.type === "group-create" ? "owner" : "member";
          socket.groupPermissions = { microphone: true, camera: true, screen: true };
          socket.groupMuteLocked = group.muteAllLocked && message.type !== "group-create";
          socket.groupMuted = socket.groupMuteLocked;
          socket.groupHandRaised = false;
          socket.groupClientId = clientId;
          socket.groupCode = code;
          socket.pendingAdmissionGroupCode = undefined;
          socket.pendingAdmissionId = undefined;
          if (message.type === "group-create") group.ownerId = socket.memberId;
          group.members.set(socket.memberId, socket);
          send(socket, {
            type: "group-joined",
            code,
            selfId: socket.memberId,
            members,
            limit: group.limit,
            meetingType: group.meetingType,
            self: memberInfo(socket, false, true),
            ownerId: group.ownerId,
            chatEnabled: group.chatEnabled,
            muteAllLocked: group.muteAllLocked === true,
            recordingAllowed: group.recordingAllowed === true,
            recordingParticipants: [...(group.recordingMembers?.values() || [])].map(({ id, name }) => ({ id, name })),
            studentAlreadySubmitted: group.students.has(socket.groupClientId),
            ...(["owner", "admin"].includes(socket.groupRole) ? { students: [...group.students.values()] } : {}),
            admissionRequests: [...group.admissionRequests.values()].map(({ id, name, requestedAt }) => ({ id, name, requestedAt })),
          });
          for (const member of group.members.values()) {
            if (member !== socket && member.groupProfileImage) send(socket, { type: "group-profile-image", id: member.memberId, profileImage: member.groupProfileImage });
          }
          broadcastGroup(group, (viewer) => ({ type: "group-member-joined", member: memberInfo(socket, ["owner", "admin"].includes(viewer.groupRole), true) }), socket);
        } else if (message.type === "group-admission-decision") {
          const group = groups.get(socket.groupCode);
          if (!group || !["owner", "admin"].includes(socket.groupRole)) return;
          const request = group.admissionRequests.get(message.requestId);
          if (!request || typeof message.accepted !== "boolean") return;
          group.admissionRequests.delete(request.id);
          request.socket.pendingAdmissionGroupCode = undefined;
          request.socket.pendingAdmissionId = undefined;
          if (message.accepted) {
            group.blockedClientIds.delete(request.clientId);
            send(request.socket, { type: "group-admission-approved", requestId: request.id });
          } else {
            send(request.socket, { type: "group-admission-rejected", requestId: request.id, message: "Your request to rejoin was declined by a meeting admin." });
          }
          broadcastGroup(group, (viewer) => groupState(group, viewer));
        } else if (message.type === "group-admin") {
          const group = groups.get(socket.groupCode);
          if (!group) return;
          const reject = (text) => send(socket, { type: "error", message: text });
          if (!["owner", "admin"].includes(socket.groupRole)) return reject("Only meeting admins can perform this action.");
          if (message.action === "chat") {
            if (typeof message.enabled !== "boolean") return reject("Invalid chat setting.");
            group.chatEnabled = message.enabled;
          } else if (message.action === "recording-permission") {
            if (socket.groupRole !== "owner") return reject("Only the meeting owner can change recording permission.");
            if (typeof message.enabled !== "boolean") return reject("Invalid recording setting.");
            group.recordingAllowed = message.enabled;
            if (!message.enabled) {
              for (const participant of group.recordingMembers.values()) send(participant.socket, { type: "group-recording-stop" });
              group.recordingMembers.clear();
            }
          } else if (message.action === "mute-all") {
            group.muteAllLocked = true;
            for (const member of group.members.values()) {
              if (member === socket || (socket.groupRole !== "owner" && ["owner", "admin"].includes(member.groupRole))) continue;
              member.groupMuteLocked = true;
              member.groupMuted = true;
              send(member, { type: "group-force-mute", by: socket.memberName });
            }
          } else if (message.action === "unmute-all") {
            group.muteAllLocked = false;
            for (const member of group.members.values()) member.groupMuteLocked = false;
          } else {
            const target = group.members.get(message.targetId);
            if (!target) return reject("That member is no longer in this meeting.");
            if (target === socket) return reject("Use your own call controls for this action.");
            if (target.groupRole === "owner" || (socket.groupRole !== "owner" && target.groupRole === "admin")) return reject("You cannot change a higher or equal role.");
            if (message.action === "role") {
              if (socket.groupRole !== "owner" || !["admin", "member"].includes(message.role)) return reject("Only the owner can grant or revoke admin access.");
              target.groupRole = message.role;
            } else if (message.action === "mute") {
              target.groupMuted = true;
              send(target, { type: "group-force-mute", by: socket.memberName });
            } else if (message.action === "permission") {
              if (!["microphone", "camera", "screen"].includes(message.permission) || typeof message.allowed !== "boolean") return reject("Invalid member permission.");
              target.groupPermissions = { ...target.groupPermissions, [message.permission]: message.allowed };
              if (message.permission === "microphone" && message.allowed && !group.muteAllLocked) target.groupMuteLocked = false;
              if (!message.allowed) {
                if (message.permission === "microphone") target.groupMuted = true;
                if (message.permission === "camera") target.groupCamera = false;
                if (message.permission === "screen") target.groupSharing = false;
              }
            } else if (message.action === "remove") {
              if (target.groupClientId) group.blockedClientIds.add(target.groupClientId);
              send(target, { type: "group-removed", message: `You were removed from the meeting by ${socket.memberName}.` });
              leave(target);
              return;
            } else return reject("Unknown meeting action.");
          }
          broadcastGroup(group, (viewer) => groupState(group, viewer));
        } else if (message.type === "group-hand") {
          const group = groups.get(socket.groupCode);
          if (!group || typeof message.raised !== "boolean") return;
          socket.handTimes = (socket.handTimes || []).filter((time) => time > Date.now() - 10_000);
          if (socket.handTimes.length >= 12) return send(socket, { type: "error", message: "Please wait before changing your hand status again." });
          socket.handTimes.push(Date.now());
          socket.groupHandRaised = message.raised;
          broadcastGroup(group, (viewer) => groupState(group, viewer));
        } else if (message.type === "group-location") {
          const group = groups.get(socket.groupCode);
          if (!group) return;
          const { latitude, longitude } = message;
          if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return send(socket, { type: "error", message: "Invalid location." });
          socket.groupLocation = { latitude, longitude, updatedAt: Date.now() };
          broadcastGroup(group, (viewer) => groupState(group, viewer));
        } else if (message.type === "group-recording") {
          const group = groups.get(socket.groupCode);
          if (!group || typeof message.active !== "boolean") return;
          if (message.active && !group.recordingAllowed) return send(socket, { type: "error", message: "Recording is disabled by the meeting owner." });
          const wasRecording = group.recordingMembers.has(socket.memberId);
          if (message.active) group.recordingMembers.set(socket.memberId, { id: socket.memberId, name: socket.memberName, socket });
          else group.recordingMembers.delete(socket.memberId);
          if (message.active && !wasRecording) broadcastGroup(group, { type: "group-recording-started", id: randomUUID(), memberId: socket.memberId, name: socket.memberName });
          broadcastGroup(group, (viewer) => groupState(group, viewer));
        } else if (message.type === "group-reaction") {
          const group = groups.get(socket.groupCode);
          if (!group) return;
          if (!REACTIONS.some((reaction) => reaction.id === message.reaction)) return send(socket, { type: "error", message: "Choose a supported meeting reaction." });
          socket.reactionTimes = (socket.reactionTimes || []).filter((time) => time > Date.now() - 5000);
          if (socket.reactionTimes.length >= 4) return send(socket, { type: "error", message: "Please wait before reacting again." });
          socket.reactionTimes.push(Date.now());
          broadcastGroup(group, { type: "group-reaction", id: randomUUID(), senderId: socket.memberId, name: socket.memberName, reaction: message.reaction, sentAt: Date.now() });
        } else if (message.type === "group-chat") {
          const group = groups.get(socket.groupCode);
          if (!group) return;
          publishGroupChat(socket, group, message);
        } else if (message.type === "group-student-registration") {
          const group = groups.get(socket.groupCode);
          if (!group) return;
          const submissionId = socket.groupClientId || socket.memberId;
          if (group.students.has(submissionId)) return send(socket, { type: "group-student-submission-rejected", message: "You have already submitted your student details for this meeting." });
          const fields = ["name", "roll", "section", "department"];
          const student = {};
          for (const field of fields) {
            if (typeof message[field] !== "string") return send(socket, { type: "error", message: "Complete all student information fields." });
            student[field] = message[field].trim();
            const maxLength = field === "department" ? 100 : field === "name" ? 100 : 50;
            if (!student[field] || student[field].length > maxLength) return send(socket, { type: "error", message: "Complete all fields and keep each entry within the allowed length." });
          }
          socket.studentSubmissionTimes = (socket.studentSubmissionTimes || []).filter((time) => time > Date.now() - 60_000);
          if (socket.studentSubmissionTimes.length >= 5) return send(socket, { type: "error", message: "Please wait before submitting student information again." });
          socket.studentSubmissionTimes.push(Date.now());
          const entry = { id: submissionId, ...student, submittedAt: Date.now() };
          group.students.set(submissionId, entry);
          send(socket, { type: "group-student-submitted" });
          for (const member of group.members.values()) {
            if (["owner", "admin"].includes(member.groupRole)) send(member, { type: "group-students", students: [...group.students.values()] });
          }
        } else if (message.type === "group-file-start") {
          const group = groups.get(socket.groupCode);
          if (!group || !group.chatEnabled) return send(socket, { type: "error", message: "Chat is disabled by a meeting admin." });
          if (socket.groupFileUpload) clearFileUpload(socket);
          if (typeof message.uploadId !== "string" || !/^[\w-]{1,80}$/.test(message.uploadId) || typeof message.fileName !== "string" || !message.fileName.trim() || message.fileName.length > 255 || typeof message.mimeType !== "string" || message.mimeType.length > 150 || !Number.isInteger(message.totalBytes) || message.totalBytes < 0 || message.totalBytes > MAX_CHAT_FILE_BYTES || !Number.isInteger(message.totalChunks) || message.totalChunks < 1 || message.totalChunks > 250) return send(socket, { type: "error", message: "Invalid file upload." });
          const upload = { ...message, chunks: [], encodedLength: 0, timer: null };
          upload.timer = setTimeout(() => { if (socket.groupFileUpload === upload) clearFileUpload(socket); }, 60_000);
          upload.timer.unref?.();
          socket.groupFileUpload = upload;
        } else if (message.type === "group-file-chunk") {
          const upload = socket.groupFileUpload;
          if (!upload || message.uploadId !== upload.uploadId || !Number.isInteger(message.index) || message.index !== upload.chunks.length || typeof message.data !== "string" || message.data.length > 32 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(message.data) || message.data.length % 4 !== 0 || upload.encodedLength + message.data.length > Math.ceil(MAX_CHAT_FILE_BYTES * 4 / 3) + 4) {
            clearFileUpload(socket);
            return send(socket, { type: "error", message: "File upload was interrupted. Please try again." });
          }
          upload.chunks.push(message.data);
          upload.encodedLength += message.data.length;
        } else if (message.type === "group-file-end") {
          const group = groups.get(socket.groupCode);
          const upload = socket.groupFileUpload;
          if (!group || !upload || message.uploadId !== upload.uploadId) return send(socket, { type: "error", message: "File upload was interrupted. Please try again." });
          clearFileUpload(socket);
          const data = upload.chunks.join("");
          const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
          const actualBytes = Math.floor(data.length * 3 / 4) - padding;
          if (upload.chunks.length !== upload.totalChunks || actualBytes !== upload.totalBytes) return send(socket, { type: "error", message: "File upload was incomplete. Please try again." });
          publishGroupChat(socket, group, { kind: "file", fileName: upload.fileName, mimeType: upload.mimeType, data: `data:${upload.mimeType || "application/octet-stream"};base64,${data}` });
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
          socket.groupMuted = socket.groupPermissions.microphone && !socket.groupMuteLocked ? message.muted : true;
          socket.groupSharing = socket.groupPermissions.screen && message.sharing;
          socket.groupCamera = socket.groupPermissions.camera && message.camera === true;
          broadcastGroup(
            group,
            { type: "group-member-media", ...memberInfo(socket) },
            socket,
          );
        } else if (message.type === "group-rescue-mode") {
          const group = groups.get(socket.groupCode);
          if (!group?.members.has(socket.memberId)) return;
          socket.groupRescueMode = message.enabled === true;
          broadcastGroup(group, {
            type: "group-rescue-mode",
            id: socket.memberId,
            enabled: socket.groupRescueMode,
          }, socket);
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
