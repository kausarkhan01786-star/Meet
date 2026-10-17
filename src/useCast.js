import { useEffect, useRef, useState } from "react";

export async function loadRtcConfiguration(fetchSettings = fetch) {
  const response = await fetchSettings("/api/rtc-config", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Connection settings unavailable (HTTP ${response.status}). Restart the Relay server and reload both devices.`);
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("This address is not serving connection settings. Restart the Relay server, then open the current phone link shown on the PC and reload both devices.");
  }
  const config = await response.json();
  if (!Array.isArray(config?.iceServers) || !["all", "relay"].includes(config.iceTransportPolicy)) {
    throw new Error("Invalid connection settings. Restart the Relay server and reload both devices.");
  }
  return config;
}

export function useCast() {
  const [role, setRole] = useState("home");
  const [online, setOnline] = useState(false);
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [stream, setStream] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [phoneConnected, setPhoneConnected] = useState(false);
  const [quality, setQuality] = useState("1080");
  const [audio, setAudio] = useState(false);
  const [microphone, setMicrophone] = useState(true);
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const localRef = useRef(null);
  const displayRef = useRef(null);
  const microphoneRef = useRef(null);
  const audioContextRef = useRef(null);
  const roleRef = useRef("home");
  const joinedRef = useRef(false);
  const pendingIce = useRef([]);
  const generation = useRef(0);
  const send = (message) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false;
    socketRef.current.send(JSON.stringify(message));
    return true;
  };
  const closePeer = () => {
    if (peerRef.current) {
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.close();
    }
    peerRef.current = null;
    pendingIce.current = [];
  };
  const stopMedia = () => {
    for (const source of [displayRef.current, microphoneRef.current]) {
      source?.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
    }
    displayRef.current = null;
    microphoneRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    localRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    localRef.current = null;
    setStream(null);
    setSharing(false);
    setMicrophoneMuted(false);
  };
  const createPeer = async () => {
    const currentGeneration = generation.current;
    closePeer();
    const config = await loadRtcConfiguration();
    if (currentGeneration !== generation.current) return null;
    const peer = new RTCPeerConnection({
      iceServers: config.iceServers,
      iceTransportPolicy: config.iceTransportPolicy,
    });
    peerRef.current = peer;
    peer.onicecandidate = ({ candidate }) => {
      if (candidate) send({ type: "ice", payload: candidate.toJSON() });
    };
    peer.ontrack = ({ streams }) => setStream(streams[0]);
    peer.onconnectionstatechange = () => {
      if (peerRef.current !== peer) return;
      if (peer.connectionState === "connected") {
        setStatus("connected");
        setError("");
      }
      if (["failed", "disconnected"].includes(peer.connectionState)) {
        setStatus("interrupted");
        setError(
          "Connection interrupted. Check your internet, then disconnect and pair again. Restricted networks may require a TURN relay.",
        );
      }
    };
    return peer;
  };
  const makeOffer = async () => {
    if (!joinedRef.current || !localRef.current) return;
    const peer = await createPeer();
    if (!peer || !joinedRef.current || !localRef.current) return;
    localRef.current
      .getTracks()
      .forEach((track) => peer.addTrack(track, localRef.current));
    await peer.setLocalDescription(await peer.createOffer());
    if (peerRef.current === peer)
      send({ type: "offer", payload: peer.localDescription.toJSON() });
    setStatus("connecting");
  };
  const flushIce = async (peer) => {
    for (const candidate of pendingIce.current.splice(0))
      await peer.addIceCandidate(candidate);
  };
  const reset = () => {
    generation.current += 1;
    setCapturing(false);
    send({ type: "leave" });
    closePeer();
    stopMedia();
    joinedRef.current = false;
    setPhoneConnected(false);
    setCode("");
    setError("");
    setStatus("idle");
  };

  useEffect(() => {
    let active = true;
    let reconnect;
    function connect() {
      const socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/signal`,
      );
      socketRef.current = socket;
      let queue = Promise.resolve();
      socket.onopen = () => {
        if (!active) return socket.close();
        setOnline(true);
        setError("");
        if (roleRef.current === "pc") send({ type: "create" });
      };
      socket.onclose = () => {
        if (!active) return;
        generation.current += 1;
        setCapturing(false);
        setOnline(false);
        closePeer();
        stopMedia();
        joinedRef.current = false;
        setPhoneConnected(false);
        setCode("");
        setStatus("idle");
        setError("Server disconnected. Reconnecting...");
        reconnect = setTimeout(connect, 2500);
      };
      socket.onerror = () => socket.close();
      socket.onmessage = (event) => {
        queue = queue
          .then(async () => {
            if (!active || socket !== socketRef.current) return;
            const message = JSON.parse(event.data);
            if (message.type === "created") {
              setCode(message.code);
              setExpiresAt(message.expiresAt);
              setStatus("waiting");
            }
            if (message.type === "joined") {
              setStatus("waiting-screen");
              joinedRef.current = true;
            }
            if (message.type === "peer-joined") {
              joinedRef.current = true;
              setPhoneConnected(true);
              setStatus("waiting-screen");
              await makeOffer();
            }
            if (message.type === "offer") {
              const peer = await createPeer();
              if (!peer) return;
              await peer.setRemoteDescription(message.payload);
              await flushIce(peer);
              await peer.setLocalDescription(await peer.createAnswer());
              send({ type: "answer", payload: peer.localDescription.toJSON() });
              setStatus("connecting");
            }
            if (message.type === "answer" && peerRef.current) {
              await peerRef.current.setRemoteDescription(message.payload);
              await flushIce(peerRef.current);
            }
            if (message.type === "ice") {
              if (peerRef.current?.remoteDescription)
                await peerRef.current.addIceCandidate(message.payload);
              else pendingIce.current.push(message.payload);
            }
            if (message.type === "peer-left") {
              joinedRef.current = false;
              setPhoneConnected(false);
              closePeer();
              setStatus("waiting");
            }
            if (message.type === "ended") {
              joinedRef.current = false;
              closePeer();
              setStream(null);
              setStatus("idle");
              setError(
                "Screen sharing ended on the PC. Enter a new code to reconnect.",
              );
            }
            if (message.type === "expired") {
              reset();
              setStatus("expired");
            }
            if (message.type === "error") {
              setError(message.message);
              setStatus("idle");
            }
          })
          .catch((failure) => {
            console.error("Relay negotiation failed:", failure);
            setError(
              `Could not establish the video connection. ${failure.message || failure.name || "Disconnect and pair again."}`,
            );
            setStatus("interrupted");
          });
      };
    }
    connect();
    return () => {
      active = false;
      clearTimeout(reconnect);
      socketRef.current?.close();
      closePeer();
      for (const source of [
        localRef.current,
        displayRef.current,
        microphoneRef.current,
      ])
        source?.getTracks().forEach((track) => track.stop());
      audioContextRef.current?.close().catch(() => {});
    };
  }, []);

  function selectRole(nextRole) {
    reset();
    roleRef.current = nextRole;
    setRole(nextRole);
    if (nextRole === "pc" && !send({ type: "create" })) setStatus("idle");
  }
  async function startSharing() {
    if (capturing || sharing) return;
    setError("");
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError(
        "Screen capture needs desktop Chrome or Edge on HTTPS (or localhost for local testing).",
      );
      return;
    }
    const currentGeneration = generation.current;
    setCapturing(true);
    let display;
    let voice;
    let requestingMicrophone = false;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: {
          height: { ideal: Number(quality) },
          frameRate: { ideal: 30, max: 30 },
        },
        audio,
      });
      if (generation.current !== currentGeneration) {
        display.getTracks().forEach((track) => track.stop());
        return;
      }
      stopMedia();
      displayRef.current = display;
      display.getVideoTracks()[0].onended = () => {
        reset();
        send({ type: "create" });
      };
      if (microphone) {
        requestingMicrophone = true;
        voice = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        requestingMicrophone = false;
        if (generation.current !== currentGeneration) {
          voice.getTracks().forEach((track) => track.stop());
          return;
        }
        microphoneRef.current = voice;
      }
      const sources = [display, voice].filter(
        (source) => source?.getAudioTracks().length,
      );
      let audioTracks = sources.flatMap((source) => source.getAudioTracks());
      if (sources.length > 1) {
        const context = new AudioContext();
        audioContextRef.current = context;
        const destination = context.createMediaStreamDestination();
        for (const source of sources)
          context
            .createMediaStreamSource(new MediaStream(source.getAudioTracks()))
            .connect(destination);
        await context.resume();
        if (generation.current !== currentGeneration) return;
        audioTracks = destination.stream.getAudioTracks();
      }
      const media = new MediaStream([
        ...display.getVideoTracks(),
        ...audioTracks,
      ]);
      localRef.current = media;
      setStream(media);
      setSharing(true);
      await makeOffer();
    } catch (failure) {
      display?.getTracks().forEach((track) => track.stop());
      voice?.getTracks().forEach((track) => track.stop());
      if (generation.current !== currentGeneration) return;
      stopMedia();
      setError(
        requestingMicrophone
          ? "Microphone access failed. Allow microphone permission, or turn off Share microphone and try again."
          : failure.name === "NotAllowedError"
            ? "Screen selection cancelled. Choose a screen when you are ready."
            : "Could not share this screen. Check browser permissions and try again.",
      );
    } finally {
      if (generation.current === currentGeneration) setCapturing(false);
    }
  }
  function join(value) {
    setError("");
    if (!/^\d{6}$/.test(value))
      return setError("Enter the six-digit code shown on your PC.");
    if (!window.RTCPeerConnection)
      return setError(
        "This browser needs HTTPS for screen receiving. Open the same HTTPS website as the PC.",
      );
    setStatus("joining");
    if (!send({ type: "join", code: value })) {
      setError("Server is offline. Wait for it to reconnect.");
      setStatus("idle");
    }
  }
  function disconnect() {
    reset();
    if (roleRef.current === "pc") send({ type: "create" });
  }
  function refreshCode() {
    reset();
    send({ type: "create" });
  }
  function toggleMicrophone() {
    const next = !microphoneMuted;
    microphoneRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMicrophoneMuted(next);
  }
  return {
    role,
    online,
    code,
    expiresAt,
    status,
    error,
    stream,
    sharing,
    capturing,
    phoneConnected,
    quality,
    setQuality,
    audio,
    setAudio,
    microphone,
    setMicrophone,
    microphoneMuted,
    toggleMicrophone,
    selectRole,
    startSharing,
    join,
    disconnect,
    refreshCode,
    setError,
  };
}
