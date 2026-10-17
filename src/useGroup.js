import { useEffect, useRef, useState } from "react";
import { loadRtcConfiguration } from "./useCast.js";
import { playFeedback } from "./feedback.js";

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
  const [localCamera, setLocalCamera] = useState(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [connections, setConnections] = useState({});
  const [muted, setMuted] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [localScreen, setLocalScreen] = useState(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const [retry, setRetry] = useState(0);
  const socketRef = useRef(null);
  const peersRef = useRef(new Map());
  const pendingIceRef = useRef(new Map());
  const micRef = useRef(null);
  const screenRef = useRef(null);
  const cameraRef = useRef(null);
  const roomRef = useRef(null);
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
    for (const id of peersRef.current.keys()) closePeer(id);
    pendingIceRef.current.clear();
    for (const source of [micRef.current, screenRef.current, cameraRef.current])
      source?.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
    micRef.current = null;
    screenRef.current = null;
    cameraRef.current = null;
    roomRef.current = null;
    busyRef.current = false;
    enteringRef.current = false;
  };
  const clearView = () => {
    setRoom(null);
    setMembers([]);
    setStreams({});
    setCameraStreams({});
    setLocalCamera(null);
    setCameraOn(false);
    setConnections({});
    setLocalScreen(null);
    setSharing(false);
    setMuted(true);
    setJoining(false);
    setMediaBusy(false);
    setMessages([]);
  };
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
            roomRef.current = message;
            setRoom(message);
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
          } else if (message.type === "group-chat" && roomRef.current) {
            if (message.senderId === roomRef.current.selfId)
              playFeedback("sent");
            setMessages((current) => [...current.slice(-199), message]);
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
            if (!roomRef.current) {
              release();
              clearView();
            }
            setError(message.message);
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
      setMuted(!voice);
      if (
        !send({
          type: mode === "create" ? "group-create" : "group-join",
          name: displayName,
          code,
          meetingType,
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
    const currentGeneration = generation.current;
    busyRef.current = true;
    setMediaBusy(true);
    try {
      if (!micRef.current) {
        const voice = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
        if (currentGeneration !== generation.current) {
          voice.getTracks().forEach((track) => track.stop());
          return;
        }
        micRef.current = voice;
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
      if (currentGeneration !== generation.current) {
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
      if (currentGeneration !== generation.current) {
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
  function sendMessage(text) {
    if (!roomRef.current || !text.trim() || text.length > 2000) return false;
    return send({ type: "group-chat", text: text.trim() });
  }
  return {
    online,
    joining,
    room,
    members,
    streams,
    cameraStreams,
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
  };
}
