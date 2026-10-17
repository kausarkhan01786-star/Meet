import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Expand,
  Headphones,
  LoaderCircle,
  LogIn,
  LogOut,
  Mic,
  MicOff,
  Monitor,
  MonitorUp,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useGroup } from "./useGroup";

export function MemberAudio({ stream, muted, name }) {
  const audioRef = useRef(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const audio = audioRef.current;
    if (!stream) return;
    audio.srcObject = new MediaStream(stream.getAudioTracks());
    audio
      .play()
      .then(() => setBlocked(false))
      .catch(() => setBlocked(true));
    return () => {
      audio.srcObject = null;
    };
  }, [stream]);
  return (
    <>
      <audio ref={audioRef} autoPlay muted={muted} />
      {blocked && !muted && (
        <button
          className="text-button group-enable-audio"
          onClick={() =>
            audioRef.current
              .play()
              .then(() => setBlocked(false))
              .catch(() => setBlocked(true))
          }
        >
          <Volume2 size={14} /> Hear {name}
        </button>
      )}
    </>
  );
}

export function SharedScreen({ stream, name, local = false }) {
  const videoRef = useRef(null);
  const tileRef = useRef(null);
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const video = videoRef.current;
    if (!stream) return;
    video.srcObject = new MediaStream(stream.getVideoTracks());
    video
      .play()
      .then(() => setBlocked(false))
      .catch(() => setBlocked(true));
    return () => {
      video.srcObject = null;
    };
  }, [stream]);
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (tileRef.current.requestFullscreen)
        await tileRef.current.requestFullscreen();
      else if (videoRef.current.webkitEnterFullscreen)
        videoRef.current.webkitEnterFullscreen();
      else setNotice("Fullscreen unavailable in this browser.");
    } catch {
      setNotice("Fullscreen unavailable in this browser.");
    }
  }
  return (
    <section
      className="group-screen"
      ref={tileRef}
      aria-label={`${name}'s shared screen`}
    >
      <div className="group-screen-heading">
        <span>
          <Monitor size={14} /> {name}
          {local ? " (you)" : ""}
        </span>
        <button
          className="icon-button small"
          disabled={!stream}
          title={`Fullscreen ${name}'s screen`}
          aria-label={`Fullscreen ${name}'s screen`}
          onClick={fullscreen}
        >
          <Expand size={16} />
        </button>
      </div>
      <div className="group-screen-media">
        <video ref={videoRef} autoPlay muted playsInline />
        {!stream && (
          <span className="group-video-loading">
            <LoaderCircle className="spin" size={20} /> Connecting screen...
          </span>
        )}
        {blocked && (
          <button
            className="video-play"
            onClick={() =>
              videoRef.current
                .play()
                .then(() => setBlocked(false))
                .catch(() => setBlocked(true))
            }
          >
            Play screen
          </button>
        )}
      </div>
      {notice && (
        <p className="group-inline-notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}

export default function GroupRoom({ onBack }) {
  const group = useGroup();
  const [mode, setMode] = useState(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [speakersMuted, setSpeakersMuted] = useState(false);
  const copyTimer = useRef(null);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(group.room.code);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      group.setError(
        "Clipboard unavailable. Select and copy the group code manually.",
      );
    }
  }
  function back() {
    group.leave();
    onBack();
  }
  const sharingMembers = group.members.filter((member) => member.sharing);
  const screens = sharingMembers.length + Number(group.sharing);
  return (
    <div className="group-page">
      <button className="back-button" onClick={back}>
        <ArrowLeft size={16} /> All devices
      </button>
      <section className="page-heading session-heading">
        <div className="eyebrow">
          <span /> GROUP WORKSPACE
        </div>
        <h1>
          {group.room
            ? "Together, on the same page."
            : "Bring everyone together."}
        </h1>
        <p>
          {group.room
            ? `${group.members.length + 1} of ${group.room.limit} members / Group ${group.room.code}`
            : "A shared room for your voices and screens."}
        </p>
      </section>
      {!group.online && (
        <div className="group-offline" role="status">
          <span>
            <Radio size={15} /> Group server offline
          </span>
          <button className="text-button" onClick={group.reconnect}>
            <RefreshCw size={14} /> Reconnect
          </button>
        </div>
      )}
      {!group.room ? (
        <>
          {!mode ? (
            <div className="group-entry-grid">
              <button
                className="group-entry-option"
                onClick={() => setMode("create")}
              >
                <span className="group-option-icon">
                  <Plus size={25} />
                </span>
                <span>
                  <strong>Create group</strong>
                  <small>Start a room and get a six-digit code.</small>
                </span>
                <ArrowRight size={20} />
              </button>
              <button
                className="group-entry-option"
                onClick={() => setMode("join")}
              >
                <span className="group-option-icon receiver">
                  <LogIn size={25} />
                </span>
                <span>
                  <strong>Add group / Join group</strong>
                  <small>Join with a code someone shared.</small>
                </span>
                <ArrowRight size={20} />
              </button>
            </div>
          ) : (
            <form
              className="group-entry-form"
              onSubmit={(event) => {
                event.preventDefault();
                group.enter(mode, name.trim(), code);
              }}
            >
              <div className="panel-label">
                {mode === "create" ? <Plus size={18} /> : <LogIn size={18} />}
                {mode === "create" ? "Create your group" : "Join a group"}
                <button
                  type="button"
                  className="icon-button small"
                  title="Back to group options"
                  aria-label="Back to group options"
                  onClick={() => {
                    group.leave();
                    setMode(null);
                  }}
                >
                  <X size={17} />
                </button>
              </div>
              <label className="field-label" htmlFor="group-name">
                Your name
              </label>
              <input
                id="group-name"
                className="group-name-input"
                autoComplete="nickname"
                placeholder="Your name"
                maxLength={40}
                required
                value={name}
                disabled={group.joining}
                onChange={(event) => setName(event.target.value)}
              />
              {mode === "join" && (
                <>
                  <label className="field-label" htmlFor="group-code">
                    Six-digit group code
                  </label>
                  <input
                    id="group-code"
                    className="code-input"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    placeholder="000000"
                    required
                    value={code}
                    disabled={group.joining}
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                  />
                </>
              )}
              <button
                className="primary-button"
                type="submit"
                disabled={
                  !group.online ||
                  group.joining ||
                  !name.trim() ||
                  (mode === "join" && code.length !== 6)
                }
              >
                {group.joining ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Mic size={17} />
                )}
                {group.joining
                  ? "Connecting..."
                  : mode === "create"
                    ? "Create group"
                    : "Join group"}
              </button>
              <p className="subtle-note">
                <ShieldCheck size={13} /> Only share the code with people you
                trust.
              </p>
            </form>
          )}
          <div className="group-empty-note">
            <Users size={17} />
            <p>
              Up to 6 people. Everyone can speak and view shared screens.
              <br />
              <span>
                Screen sharing requires a supported desktop browser. Different
                networks still need public HTTPS hosting and TURN.
              </span>
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="group-room-bar">
            <div className="group-room-code">
              <Users size={18} />
              <span>
                GROUP CODE <strong>{group.room.code}</strong>
              </span>
              <button
                className="icon-button"
                title={copied ? "Copied group code" : "Copy group code"}
                aria-label="Copy group code"
                onClick={copyCode}
              >
                {copied ? <Check size={17} /> : <Copy size={17} />}
              </button>
            </div>
            <div className="group-room-actions">
              <button
                className={`group-control ${group.muted ? "is-muted" : ""}`}
                disabled={group.mediaBusy}
                onClick={group.toggleMic}
                title={group.muted ? "Unmute microphone" : "Mute microphone"}
                aria-label={
                  group.muted ? "Unmute microphone" : "Mute microphone"
                }
              >
                {group.muted ? <MicOff size={17} /> : <Mic size={17} />}
                <span>{group.muted ? "Unmute" : "Mic on"}</span>
              </button>
              <button
                className="group-control"
                title={speakersMuted ? "Unmute speakers" : "Mute speakers"}
                aria-label={speakersMuted ? "Unmute speakers" : "Mute speakers"}
                onClick={() => setSpeakersMuted(!speakersMuted)}
              >
                {speakersMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
              <button
                className={`group-control ${group.sharing ? "is-sharing" : ""}`}
                disabled={group.mediaBusy}
                onClick={group.shareScreen}
              >
                {group.mediaBusy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <MonitorUp size={17} />
                )}
                <span>{group.sharing ? "Stop sharing" : "Share screen"}</span>
              </button>
              <button
                className="group-control group-leave"
                onClick={group.leave}
              >
                <LogOut size={17} />
                <span>Leave group</span>
              </button>
            </div>
          </div>
          <div className="group-room-layout">
            <aside className="group-members">
              <div className="group-section-heading">
                <h2>Members</h2>
                <span>
                  {group.members.length + 1}/{group.room.limit}
                </span>
              </div>
              <div className="group-member self">
                <span className="group-avatar">
                  {(name.trim() || "You").slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <strong>
                    {name.trim() || "You"}
                    <span className="group-you">you</span>
                  </strong>
                  <small>
                    {group.sharing
                      ? "Sharing screen"
                      : group.muted
                        ? "Microphone muted"
                        : "Microphone on"}
                  </small>
                </div>
                {group.muted ? <MicOff size={15} /> : <Mic size={15} />}
              </div>
              {group.members.map((member) => (
                <div
                  className="group-member"
                  key={member.id}
                  data-member-id={member.id}
                >
                  <span className="group-avatar">
                    {member.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <strong>{member.name}</strong>
                    <small>
                      {["failed", "disconnected"].includes(
                        group.connections[member.id],
                      )
                        ? "Connection interrupted"
                        : group.connections[member.id] !== "connected"
                          ? "Connecting..."
                          : member.sharing
                            ? "Sharing screen"
                            : member.muted
                              ? "Microphone muted"
                              : "Connected"}
                    </small>
                    <MemberAudio
                      stream={group.streams[member.id]}
                      muted={speakersMuted}
                      name={member.name}
                    />
                  </div>
                  {member.muted ? <MicOff size={15} /> : <Mic size={15} />}
                </div>
              ))}
              <p className="group-member-footnote">
                <ShieldCheck size={13} /> Encrypted member-to-member media
              </p>
            </aside>
            <section className="group-stage">
              <div className="group-section-heading">
                <h2>{screens ? "Shared screens" : "Group voice"}</h2>
                <span>
                  {screens ? (
                    `${screens} active`
                  ) : (
                    <>
                      <Headphones size={13} /> Connected room
                    </>
                  )}
                </span>
              </div>
              {screens ? (
                <div className="group-screens-grid">
                  {group.sharing && (
                    <SharedScreen
                      stream={group.localScreen}
                      name={name.trim() || "You"}
                      local
                    />
                  )}
                  {sharingMembers.map((member) => (
                    <SharedScreen
                      key={member.id}
                      stream={group.streams[member.id]}
                      name={member.name}
                    />
                  ))}
                </div>
              ) : (
                <div className="group-voice-stage">
                  <div className="group-voice-symbol">
                    <Headphones size={38} strokeWidth={1.2} />
                  </div>
                  <h3>
                    {group.members.length
                      ? "Your group is here."
                      : "A little company, one code away."}
                  </h3>
                  <p>
                    {group.members.length
                      ? "Microphones connected. No screens shared yet."
                      : "Share the group code to invite someone."}
                  </p>
                  <span>
                    <span className="status-dot" /> {group.members.length + 1}{" "}
                    member{group.members.length ? "s" : ""} in the room
                  </span>
                </div>
              )}
            </section>
          </div>
        </>
      )}
      {group.error && (
        <div className="error-message" role="alert">
          <span>{group.error}</span>
          <button
            className="icon-button small"
            aria-label="Dismiss group error"
            onClick={() => group.setError("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
