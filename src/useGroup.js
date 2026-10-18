import { useEffect, useRef, useState } from "react";
import { loadRtcConfiguration } from "./useCast.js";
import { playFeedback } from "./feedback.js";
import { parseChatContent } from "../shared/meeting-content.js";

function persistentClientId() {
  const key = "meeting.participant-id.v1";
  try {
    const existing = localStorage.getItem(key);
    if (existing && /^[\w-]{8,80}$/.test(existing)) return existing;
  } catch {}
  const id = globalThis.crypto?.randomUUID?.() || `participant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  try { localStorage.setItem(key, id); } catch {}
  return id;
}

export function mediaSlot(transceiver, transceivers) {
  if (transceiver.receiver.track.kind === "audio") return "audio";
  return transceivers
    .filter((item) => item.receiver.track.kind === "video")
    .indexOf(transceiver) === 0
    ? "screen"
    : "camera";
}

export function useGroup({ meetingType = "group" } = {}) {
  const [online, setOnline] = useState(false);
  const [joining, setJoining] = useState(false);
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [streams, setStreams] = useState({});
  const [cameraStreams, setCameraStreams] = useState({});
  const [localAudio, setLocalAudio] = useState(null);
  const [localCamera, setLocalCamera] = useState(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [connections, setConnections] = useState({});
  const [muted, setMuted] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [localScreen, setLocalScreen] = useState(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const [self, setSelf] = useState(null);
  const [reactions, setReactions] = useState([]);
  const [recordingParticipants, setRecordingParticipants] = useState([]);
  const [recordingStopSignal, setRecordingStopSignal] = useState(0);
  const [admissionRequests, setAdmissionRequests] = useState([]);
  const [admissionStatus, setAdmissionStatus] = useState(null);
  const [retry, setRetry] = useState(0);
  const socketRef = useRef(null);
  const peersRef = useRef(new Map());
  const pendingIceRef = useRef(new Map());
  const incomingFilesRef = useRef(new Map());
  const admissionRef = useRef(null);
  const locationCaptureRef = useRef(null);
  const pendingRecordingPermissionRef = useRef(null);
  const micRef = useRef(null);
  const screenRef = useRef(null);
  const cameraRef = useRef(null);
  const roomRef = useRef(null);
  const permissionsRef = useRef({ microphone: true, camera: true, screen: true });
  const configRef = useRef(null);
  const generation = useRef(0);
  const busyRef = useRef(false);
  const enteringRef = useRef(false);
  const send = (message) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false;
    socketRef.current.send(JSON.stringify(message));
    return true;
  };
  const publishMedia = () =>
    send({
      type: "group-media",
      muted: !micRef.current
        ?.getAudioTracks()
        .some((track) => track.enabled && track.readyState === "live"),
      sharing: Boolean(screenRef.current),
      camera: Boolean(cameraRef.current),
    });
  const closePeer = (id) => {
    const entry = peersRef.current.get(id);
    if (entry) {
      entry.peer.onconnectionstatechange = null;
      entry.peer.close();
      peersRef.current.delete(id);
    }
    pendingIceRef.current.delete(id);
  };
  const release = () => {
    generation.current += 1;
    locationCaptureRef.current = null;
    pendingRecordingPermissionRef.current = null;
    for (const id of peersRef.current.keys()) closePeer(id);
    pendingIceRef.current.clear();
    incomingFilesRef.current.clear();
    for (const source of [micRef.current, screenRef.current, cameraRef.current])
      source?.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
    micRef.current = null;
    screenRef.current = null;
    cameraRef.current = null;
    roomRef.current = null;
    permissionsRef.current = { microphone: true, camera: true, screen: true };
    busyRef.current = false;
    enteringRef.current = false;
  };
  const clearView = () => {
    setRoom(null);
    setMembers([]);
    setStreams({});
    setCameraStreams({});
    setLocalAudio(null);
    setLocalCamera(null);
    setCameraOn(false);
    setConnections({});
    setLocalScreen(null);
    setSharing(false);
    setMuted(true);
    setJoining(false);
    setMediaBusy(false);
    setMessages([]);
    setSelf(null);
    setReactions([]);
    setRecordingParticipants([]);
    setAdmissionRequests([]);
    setAdmissionStatus(null);
    admissionRef.current = null;
  };
  useEffect(() => {
    if (!reactions.length) return;
    const timer = setTimeout(() => setReactions((current) => current.filter((reaction) => reaction.expiresAt > Date.now())), Math.max(0, Math.min(...reactions.map((reaction) => reaction.expiresAt)) - Date.now()));
    return () => clearTimeout(timer);
  }, [reactions]);
  useEffect(() => {
    if (!["owner", "admin"].includes(self?.role) || !admissionRequests.length) return;
    playFeedback("admission");
    const timer = setInterval(() => playFeedback("admission"), 1800);
    return () => clearInterval(timer);
  }, [admissionRequests.length, self?.role]);
  function forceMute() {
    micRef.current?.getAudioTracks().forEach((track) => { track.enabled = false; });
    setMuted(true);
  }
  async function applyPermissions(member) {
    permissionsRef.current = member.permissions || { microphone: true, camera: true, screen: true };
    if (!permissionsRef.current.microphone || member.micLocked) forceMute();
    if (!permissionsRef.current.camera && cameraRef.current) await stopCamera();
    if (!permissionsRef.current.screen && screenRef.current) await stopScreen();
  }
  const sendTracks = async (entry) => {
    for (const transceiver of entry.peer.getTransceivers()) {
      const slot = mediaSlot(transceiver, entry.peer.getTransceivers());
      const track =
        slot === "audio"
          ? micRef.current?.getAudioTracks()[0]
          : slot === "screen"
            ? screenRef.current?.getVideoTracks()[0]
            : cameraRef.current?.getVideoTracks()[0];
      transceiver.direction = "sendrecv";
      await transceiver.sender.replaceTrack(track || null);
    }
  };
  const createPeer = (id, initiator) => {
    if (peersRef.current.has(id)) return peersRef.current.get(id);
    const peer = new RTCPeerConnection({
      iceServers: configRef.current.iceServers,
      iceTransportPolicy: configRef.current.iceTransportPolicy,
    });
    const remote = new MediaStream();
    const camera = new MediaStream();
    const entry = { peer, remote, camera };
    peersRef.current.set(id, entry);
    if (initiator) {
      peer.addTransceiver("audio", { direction: "sendrecv" });
      peer.addTransceiver("video", { direction: "sendrecv" });
      peer.addTransceiver("video", { direction: "sendrecv" });
    }
    peer.onicecandidate = ({ candidate }) => {
      if (candidate)
        send({
          type: "group-signal",
          to: id,
          kind: "ice",
          payload: candidate.toJSON(),
        });
    };
    peer.ontrack = ({ track, transceiver }) => {
      if (mediaSlot(transceiver, peer.getTransceivers()) === "camera") {
        if (!camera.getTracks().some((existing) => existing.id === track.id))
          camera.addTrack(track);
        setCameraStreams((current) => ({
          ...current,
          [id]: new MediaStream(camera.getTracks()),
        }));
        return;
      }
      if (!remote.getTracks().some((existing) => existing.id === track.id))
        remote.addTrack(track);
      setStreams((current) => ({
        ...current,
        [id]: new MediaStream(remote.getTracks()),
      }));
    };
    peer.onconnectionstatechange = () => {
      if (peersRef.current.get(id) !== entry) return;
      setConnections((current) => ({ ...current, [id]: peer.connectionState }));
      if (peer.connectionState === "connected" && !entry.connectedFeedback) {
        entry.connectedFeedback = true;
        playFeedback("connected");
      }
      if (peer.connectionState === "failed")
        setError(
          "A member connection failed. Rejoin the group; different networks may require a working TURN relay.",
        );
    };
    return entry;
  };
  const flushIce = async (id, peer) => {
    for (const candidate of pendingIceRef.current.get(id) || [])
      await peer.addIceCandidate(candidate);
    pendingIceRef.current.delete(id);
  };

  useEffect(() => {
    let active = true;
    const socket = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/signal`,
    );
    socketRef.current = socket;
    let queue = Promise.resolve();
    socket.onopen = () => {
      if (active) {
        setOnline(true);
        setError("");
      }
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      if (!active) return;
      if (roomRef.current) playFeedback("ended");
      release();
      clearView();
      setOnline(false);
      setError(
        "Group server disconnected. Reconnect, then create or join a group again.",
      );
    };
    socket.onmessage = (event) => {
      const currentGeneration = generation.current;
      queue = queue
        .then(async () => {
          if (!active || currentGeneration !== generation.current) return;
          const message = JSON.parse(event.data);
          if (message.type === "group-joined") {
            if (!enteringRef.current) return;
            enteringRef.current = false;
            admissionRef.current = null;
            setAdmissionStatus(null);
            roomRef.current = message;
            setRoom(message);
            setSelf(message.self);
            setAdmissionRequests(message.admissionRequests || []);
            setRecordingParticipants(message.recordingParticipants || []);
            const locationCapture = locationCaptureRef.current;
            if (locationCapture) locationCapture.promise.then((coordinates) => {
              if (coordinates && locationCaptureRef.current === locationCapture && roomRef.current?.selfId === message.selfId) send({ type: "group-location", ...coordinates });
            });
            permissionsRef.current = message.self?.permissions || { microphone: true, camera: true, screen: true };
            setMembers(message.members);
            setJoining(false);
            publishMedia();
            for (const member of message.members) {
              const entry = createPeer(member.id, true);
              await sendTracks(entry);
              if (!active || currentGeneration !== generation.current) return;
              await entry.peer.setLocalDescription(
                await entry.peer.createOffer(),
              );
              send({
                type: "group-signal",
                to: member.id,
                kind: "offer",
                payload: entry.peer.localDescription.toJSON(),
              });
            }
          } else if (message.type === "group-state" && roomRef.current) {
            const own = message.members.find((member) => member.id === roomRef.current.selfId);
            if (!own) return;
            roomRef.current = { ...roomRef.current, ownerId: message.ownerId, chatEnabled: message.chatEnabled, recordingAllowed: message.recordingAllowed === true, self: own };
            setRoom(roomRef.current);
            setSelf(own);
            setAdmissionRequests(message.admissionRequests || []);
            setRecordingParticipants(message.recordingParticipants || []);
            if (pendingRecordingPermissionRef.current && message.recordingAllowed === pendingRecordingPermissionRef.current.enabled) pendingRecordingPermissionRef.current = null;
            setMembers(message.members.filter((member) => member.id !== own.id));
            await applyPermissions(own);
          } else if (message.type === "group-admission-pending" && !roomRef.current) {
            micRef.current?.getTracks().forEach((track) => track.stop());
            micRef.current = null;
            setLocalAudio(null);
            setMuted(true);
            setJoining(false);
            setAdmissionStatus("pending");
            setError("");
          } else if (message.type === "group-admission-approved" && !roomRef.current) {
            const admission = admissionRef.current;
            if (!admission) return;
            setAdmissionStatus("approved");
            setJoining(true);
            if (!send({ type: "group-join", ...admission })) {
              setJoining(false);
              setError("Could not reconnect after approval. Please try again.");
            }
          } else if (message.type === "group-admission-rejected" && !roomRef.current) {
            release();
            clearView();
            setAdmissionStatus("rejected");
            setError(message.message || "Your request to rejoin was declined.");
          } else if (message.type === "group-force-mute" && roomRef.current) {
            forceMute();
            publishMedia();
          } else if (message.type === "group-removed") {
            playFeedback("ended");
            release();
            clearView();
            setError(message.message || "You were removed from the meeting.");
          } else if (message.type === "group-reaction" && roomRef.current) {
            setReactions((current) => [...current.slice(-11), { ...message, expiresAt: Date.now() + 4500 }]);
          } else if (message.type === "group-recording-stop" && roomRef.current) {
            setRecordingStopSignal((current) => current + 1);
          } else if (message.type === "group-chat" && roomRef.current) {
            if (message.senderId === roomRef.current.selfId)
              playFeedback("sent");
            setMessages((current) => [...current.slice(-199), message]);
          } else if (message.type === "group-file-delivery-start" && roomRef.current) {
            if (!Number.isInteger(message.totalChunks) || message.totalChunks < 1 || message.totalChunks > 250) return;
            incomingFilesRef.current.set(message.id, { ...message, chunks: [] });
          } else if (message.type === "group-file-delivery-chunk" && roomRef.current) {
            const upload = incomingFilesRef.current.get(message.id);
            if (!upload || message.index !== upload.chunks.length || typeof message.data !== "string") return;
            upload.chunks.push(message.data);
          } else if (message.type === "group-file-delivery-end" && roomRef.current) {
            const upload = incomingFilesRef.current.get(message.id);
            incomingFilesRef.current.delete(message.id);
            if (!upload || upload.chunks.length !== upload.totalChunks) return;
            const fileMessage = { ...upload, kind: "file", data: `data:${upload.mimeType || "application/octet-stream"};base64,${upload.chunks.join("")}` };
            delete fileMessage.totalChunks;
            delete fileMessage.chunks;
            if (fileMessage.senderId === roomRef.current.selfId) playFeedback("sent");
            setMessages((current) => [...current.slice(-199), fileMessage]);
          } else if (message.type === "group-member-joined") {
            setMembers((current) => [
              ...current.filter((member) => member.id !== message.member.id),
              message.member,
            ]);
          } else if (message.type === "group-member-media") {
            setMembers((current) =>
              current.map((member) =>
                member.id === message.id
                  ? {
                      ...member,
                      muted: message.muted,
                      sharing: message.sharing,
                      camera: message.camera === true,
                    }
                  : member,
              ),
            );
          } else if (message.type === "group-member-left") {
            playFeedback("ended");
            closePeer(message.id);
            setMembers((current) =>
              current.filter((member) => member.id !== message.id),
            );
            setStreams((current) => {
              const next = { ...current };
              delete next[message.id];
              return next;
            });
            setCameraStreams((current) => {
              const next = { ...current };
              delete next[message.id];
              return next;
            });
            setConnections((current) => {
              const next = { ...current };
              delete next[message.id];
              return next;
            });
          } else if (message.type === "group-signal" && roomRef.current) {
            if (message.kind === "offer") {
              const entry = createPeer(message.from, false);
              await entry.peer.setRemoteDescription(message.payload);
              await sendTracks(entry);
              await flushIce(message.from, entry.peer);
              if (!active || currentGeneration !== generation.current) return;
              await entry.peer.setLocalDescription(
                await entry.peer.createAnswer(),
              );
              send({
                type: "group-signal",
                to: message.from,
                kind: "answer",
                payload: entry.peer.localDescription.toJSON(),
              });
            } else if (message.kind === "answer") {
              const entry = peersRef.current.get(message.from);
              if (entry) {
                await entry.peer.setRemoteDescription(message.payload);
                await flushIce(message.from, entry.peer);
              }
            } else if (message.kind === "ice") {
              const entry = peersRef.current.get(message.from);
              if (entry?.peer.remoteDescription)
                await entry.peer.addIceCandidate(message.payload);
              else
                pendingIceRef.current.set(message.from, [
                  ...(pendingIceRef.current.get(message.from) || []),
                  message.payload,
                ]);
            }
          } else if (message.type === "error") {
            const pendingRecordingPermission = pendingRecordingPermissionRef.current;
            pendingRecordingPermissionRef.current = null;
            if (!roomRef.current) {
              release();
              clearView();
            }
            setError(pendingRecordingPermission && message.message === "That member is no longer in this meeting."
              ? "The meeting server is outdated. Restart it with the same command you used to start the app, then refresh this page."
              : message.message);
          }
        })
        .catch((failure) => {
          if (!active || currentGeneration !== generation.current) return;
          setJoining(false);
          setError(`Group connection failed: ${failure.message}`);
        });
    };
    return () => {
      active = false;
      socket.close();
      release();
    };
  }, [retry]);

  async function enter(mode, name, code) {
    if (!online || busyRef.current || enteringRef.current || roomRef.current)
      return;
    const displayName = typeof name === "string" ? name.trim() : "";
    if (!displayName)
      return setError("Enter your name before creating or joining a meeting.");
    if (!window.isSecureContext || !window.RTCPeerConnection)
      return setError(
        "Group voice needs HTTPS. Open the HTTPS phone address shown on the PC, or localhost on the PC.",
      );
    if (mode === "join" && !/^\d{6}$/.test(code))
      return setError("Enter the group's six-digit code.");
    const currentGeneration = generation.current;
    busyRef.current = true;
    enteringRef.current = true;
    const clientId = persistentClientId();
    locationCaptureRef.current = {
      promise: new Promise((resolve) => {
        try {
          if (!navigator.geolocation) return resolve(null);
          navigator.geolocation.getCurrentPosition(
            ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
            () => resolve(null),
            { maximumAge: 60_000, timeout: 15_000 },
          );
        } catch {
          resolve(null);
        }
      }),
    };
    admissionRef.current = { name: displayName, code, meetingType, clientId };
    setJoining(true);
    setError("");
    let voice;
    try {
      configRef.current = await loadRtcConfiguration();
      if (currentGeneration !== generation.current) return;
      try {
        voice = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
      } catch {
        if (currentGeneration === generation.current)
          setError(
            "Joined without a microphone. Allow microphone permission, then press Unmute microphone to speak.",
          );
      }
      if (currentGeneration !== generation.current) {
        voice?.getTracks().forEach((track) => track.stop());
        return;
      }
      micRef.current = voice || null;
      setLocalAudio(voice || null);
      setMuted(!voice);
      if (
        !send({
          type: mode === "create" ? "group-create" : "group-join",
          name: displayName,
          code,
          meetingType,
          clientId,
        })
      )
        throw new Error("Server is offline. Reconnect and try again.");
    } catch (failure) {
      if (currentGeneration !== generation.current) return;
      release();
      clearView();
      setError(failure.message);
    } finally {
      if (currentGeneration === generation.current) busyRef.current = false;
    }
  }
  async function replaceKind(slot, track) {
    const results = await Promise.allSettled(
      [...peersRef.current.values()].flatMap(({ peer }) =>
        peer
          .getTransceivers()
          .filter(
            (transceiver) =>
              mediaSlot(transceiver, peer.getTransceivers()) === slot,
          )
          .map((transceiver) => transceiver.sender.replaceTrack(track)),
      ),
    );
    if (results.some((result) => result.status === "rejected"))
      setError(
        "Some member media connections failed. Rejoin the group to reconnect.",
      );
  }
  async function toggleMic() {
    if (!roomRef.current || busyRef.current) return;
    if (!permissionsRef.current.microphone) return setError("An admin has disabled your microphone permission.");
    if (roomRef.current.self?.micLocked) return setError("The owner has muted everyone. Wait until the owner allows unmuting.");
    const currentGeneration = generation.current;
    busyRef.current = true;
    setMediaBusy(true);
    try {
      if (!micRef.current) {
        const voice = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
        if (currentGeneration !== generation.current || !permissionsRef.current.microphone || roomRef.current?.self?.micLocked) {
          voice.getTracks().forEach((track) => track.stop());
          return;
        }
        micRef.current = voice;
        setLocalAudio(voice);
        await replaceKind("audio", voice.getAudioTracks()[0]);
        setMuted(false);
      } else {
        const enabled = !micRef.current.getAudioTracks()[0].enabled;
        micRef.current.getAudioTracks().forEach((track) => {
          track.enabled = enabled;
        });
        setMuted(!enabled);
      }
      setError("");
      publishMedia();
    } catch {
      if (currentGeneration === generation.current)
        setError(
          "Microphone is unavailable. Check browser microphone permissions and your input device.",
        );
    } finally {
      if (currentGeneration === generation.current) {
        busyRef.current = false;
        setMediaBusy(false);
      }
    }
  }
  async function stopScreen() {
    const source = screenRef.current;
    screenRef.current = null;
    source?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    setSharing(false);
    setLocalScreen(null);
    await replaceKind("screen", null);
    publishMedia();
  }
  async function shareScreen() {
    if (!roomRef.current || busyRef.current) return;
    if (screenRef.current) return stopScreen();
    if (!permissionsRef.current.screen) return setError("An admin has disabled your screen-sharing permission.");
    if (!navigator.mediaDevices?.getDisplayMedia)
      return setError(
        "This browser cannot share a screen. Use desktop Chrome or Edge; you can still speak and view shared screens here.",
      );
    const currentGeneration = generation.current;
    busyRef.current = true;
    setMediaBusy(true);
    try {
      const source = await navigator.mediaDevices.getDisplayMedia({
        video: { height: { ideal: 720 }, frameRate: { ideal: 15, max: 30 } },
        audio: false,
      });
      if (currentGeneration !== generation.current || !permissionsRef.current.screen) {
        source.getTracks().forEach((track) => track.stop());
        return;
      }
      screenRef.current = source;
      source.getVideoTracks()[0].onended = () => {
        void stopScreen();
      };
      setLocalScreen(source);
      setSharing(true);
      await replaceKind("screen", source.getVideoTracks()[0]);
      setError("");
      publishMedia();
    } catch (failure) {
      if (currentGeneration === generation.current)
        setError(
          failure.name === "NotAllowedError"
            ? "Screen selection cancelled. Your group voice is still connected."
            : "Screen sharing failed. Check browser permissions and try again.",
        );
    } finally {
      if (currentGeneration === generation.current) {
        busyRef.current = false;
        setMediaBusy(false);
      }
    }
  }
  function leave() {
    if (roomRef.current) playFeedback("ended");
    send({ type: "leave" });
    release();
    clearView();
    setError("");
  }
  async function stopCamera() {
    const source = cameraRef.current;
    cameraRef.current = null;
    source?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    setLocalCamera(null);
    setCameraOn(false);
    await replaceKind("camera", null);
    publishMedia();
  }
  async function toggleCamera() {
    if (!roomRef.current || busyRef.current) return;
    if (cameraRef.current) return stopCamera();
    if (!permissionsRef.current.camera) return setError("An admin has disabled your camera permission.");
    const currentGeneration = generation.current;
    busyRef.current = true;
    setMediaBusy(true);
    let source;
    try {
      source = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 24, max: 30 },
          facingMode: "user",
        },
      });
      if (currentGeneration !== generation.current || !permissionsRef.current.camera) {
        source.getTracks().forEach((track) => track.stop());
        return;
      }
      const track = source.getVideoTracks()[0];
      if (!track) throw new Error("No camera video track.");
      cameraRef.current = source;
      track.onended = () => {
        void stopCamera();
      };
      setLocalCamera(source);
      setCameraOn(true);
      await replaceKind("camera", track);
      setError("");
      publishMedia();
    } catch (failure) {
      source?.getTracks().forEach((track) => track.stop());
      if (currentGeneration === generation.current)
        setError(
          failure.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access in your browser and try again; your voice call is still connected."
            : failure.name === "NotFoundError"
              ? "No camera was found. Connect a webcam or use a device with a camera."
              : failure.name === "NotReadableError"
                ? "The camera is busy or unavailable. Close other camera apps and try again."
                : "Camera could not start. Check camera permissions and try again.",
        );
    } finally {
      if (currentGeneration === generation.current) {
        busyRef.current = false;
        setMediaBusy(false);
      }
    }
  }
  function sendMessage(input) {
    if (!roomRef.current) return false;
    if (roomRef.current.chatEnabled === false) { setError("Chat is disabled by a meeting admin."); return false; }
    try {
      const content = parseChatContent(typeof input === "string" ? { text: input } : input);
      return send({ type: "group-chat", ...content });
    } catch (failure) { setError(failure.message); return false; }
  }
  async function sendFile(input) {
    if (!roomRef.current || roomRef.current.chatEnabled === false) {
      setError(roomRef.current ? "Chat is disabled by a meeting admin." : "Join a meeting before uploading files.");
      return false;
    }
    try {
      const content = parseChatContent(input);
      const [, base64 = ""] = content.data.split(",", 2);
      const chunkSize = 32 * 1024;
      const totalChunks = Math.max(1, Math.ceil(base64.length / chunkSize));
      const uploadId = globalThis.crypto.randomUUID();
      const sendUploadMessage = (message) => {
        const socket = socketRef.current;
        if (socket?.readyState !== WebSocket.OPEN) return false;
        socket.send(JSON.stringify(message));
        return true;
      };
      if (!sendUploadMessage({ type: "group-file-start", uploadId, fileName: content.fileName, mimeType: content.mimeType, totalBytes: Math.floor(base64.length * 3 / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0), totalChunks })) return false;
      for (let index = 0; index < totalChunks; index += 1) {
        while (socketRef.current?.readyState === WebSocket.OPEN && socketRef.current.bufferedAmount > 256 * 1024) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        if (!sendUploadMessage({ type: "group-file-chunk", uploadId, index, data: base64.slice(index * chunkSize, (index + 1) * chunkSize) })) return false;
      }
      return sendUploadMessage({ type: "group-file-end", uploadId });
    } catch (failure) {
      setError(failure.message || "The file could not be sent.");
      return false;
    }
  }
  function adminAction(action, options = {}) {
    if (!roomRef.current || !["owner", "admin"].includes(roomRef.current.self?.role)) return false;
    const sent = send({ ...options, type: "group-admin", action });
    if (sent && action === "recording-permission") pendingRecordingPermissionRef.current = { enabled: options.enabled };
    return sent;
  }
  function decideAdmission(requestId, accepted) {
    if (!roomRef.current || !["owner", "admin"].includes(roomRef.current.self?.role)) return false;
    return send({ type: "group-admission-decision", requestId, accepted });
  }
  function toggleHand() {
    if (!roomRef.current) return;
    send({ type: "group-hand", raised: !roomRef.current.self?.handRaised });
  }
  function react(reaction) {
    if (roomRef.current) send({ type: "group-reaction", reaction });
  }
  function reportRecording(active) {
    if (roomRef.current) send({ type: "group-recording", active });
  }
  return {
    online,
    joining,
    room,
    members,
    streams,
    cameraStreams,
    localAudio,
    localCamera,
    cameraOn,
    toggleCamera,
    connections,
    muted,
    sharing,
    localScreen,
    mediaBusy,
    error,
    setError,
    enter,
    leave,
    toggleMic,
    shareScreen,
    reconnect: () => {
      release();
      clearView();
      setRetry((current) => current + 1);
    },
    messages,
    sendMessage,
    sendFile,
    self,
    reactions,
    recordingParticipants,
    recordingStopSignal,
    reportRecording,
    admissionRequests,
    admissionStatus,
    adminAction,
    decideAdmission,
    toggleHand,
    react,
    isAdmin: ["owner", "admin"].includes(self?.role),
  };
}
