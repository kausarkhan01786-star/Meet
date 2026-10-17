import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Expand,
  ExternalLink,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Monitor,
  MonitorUp,
  Mic,
  MicOff,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Smartphone,
  Square,
  Volume2,
  VolumeX,
  Wifi,
  X,
  Users,
} from "lucide-react";
import { useCast } from "./useCast";
import GroupRoom from "./GroupRoom";

const wallpaper = "/mountain-wallpaper.jpg";

function DeviceArtwork({ phone = false }) {
  return (
    <div
      className={`device-art ${phone ? "phone-art" : "pc-art"}`}
      aria-hidden="true"
    >
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className={phone ? "phone-hardware" : "monitor-hardware"}>
        <div
          className="device-wallpaper"
          style={{ backgroundImage: `url(${wallpaper})` }}
        >
          {phone ? (
            <>
              <div className="phone-island" />
              <span className="phone-time">09:41</span>
              <span className="phone-date">Your PC, right here.</span>
              <div className="phone-live">
                <span /> PC screen
              </div>
              <div className="phone-home" />
            </>
          ) : (
            <>
              <div className="desktop-menubar">
                <span>
                  <Monitor size={8} /> Relay
                </span>
                <span>Mon 9:41 AM</span>
              </div>
              <div className="desktop-window">
                <div className="window-top">
                  <i />
                  <i />
                  <i />
                  <span>Workspace</span>
                </div>
                <div className="window-body">
                  <div className="window-sidebar">
                    <b />
                    <b />
                    <b />
                    <b />
                  </div>
                  <div className="window-content">
                    <div className="mini-title" />
                    <div className="mini-line" />
                    <div className="mini-line short" />
                    <div className="mini-tiles">
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="mini-line" />
                    <div className="mini-line short" />
                  </div>
                </div>
              </div>
              <div className="desktop-dock">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </>
          )}
        </div>
      </div>
      {!phone && (
        <>
          <div className="monitor-neck" />
          <div className="monitor-foot" />
        </>
      )}
      <div className="art-badge">
        {phone ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
        {phone ? "Receive screen" : "Share screen"}
      </div>
    </div>
  );
}

function VideoView({ stream, muted = true, videoRef, onError }) {
  const [needsPlay, setNeedsPlay] = useState(false);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream)
      video
        .play()
        .then(() => setNeedsPlay(false))
        .catch(() => setNeedsPlay(true));
    return () => {
      video.srcObject = null;
    };
  }, [stream, videoRef]);
  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="cast-video"
      />
      {needsPlay && (
        <button
          className="video-play"
          onClick={() =>
            videoRef.current
              .play()
              .then(() => setNeedsPlay(false))
              .catch(() =>
                onError(
                  "Tap the video again or check browser playback permissions.",
                ),
              )
          }
        >
          <Play size={22} /> Play screen
        </button>
      )}
    </>
  );
}

export default function App() {
  const cast = useCast();
  const [input, setInput] = useState("");
  const [modal, setModal] = useState(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [network, setNetwork] = useState([]);
  const [networkMode, setNetworkMode] = useState("local");
  const [relayConfigured, setRelayConfigured] = useState(false);
  const [copied, setCopied] = useState("");
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(Date.now());
  const videoRef = useRef(null);
  const viewerRef = useRef(null);
  const dialogRef = useRef(null);
  const copyTimer = useRef(null);
  useEffect(() => {
    fetch("/api/network")
      .then((response) => response.json())
      .then((data) => {
        setNetwork(data.urls);
        setNetworkMode(data.mode);
        setRelayConfigured(data.relayConfigured);
      })
      .catch(() => {});
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      clearTimeout(copyTimer.current);
    };
  }, []);
  useEffect(() => {
    if (modal) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [modal]);
  useEffect(() => {
    setPaused(false);
  }, [cast.stream]);
  async function copy(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(""), 2000);
    } catch {
      cast.setError(
        "Clipboard is unavailable. Select and copy the code or address manually.",
      );
    }
  }
  const remaining = Math.max(0, Math.ceil((cast.expiresAt - now) / 1000));
  const connected = cast.status === "connected";
  const phoneBusy = [
    "joining",
    "connecting",
    "waiting-screen",
    "connected",
    "interrupted",
  ].includes(cast.status);
  const statusText = connected
    ? "Connected"
    : cast.status === "connecting"
      ? "Establishing connection"
      : cast.phoneConnected
        ? "Phone paired"
        : cast.sharing
          ? "Ready for your phone"
          : "Waiting for connection";
  function home() {
    setGroupOpen(false);
    cast.selectRole("home");
    setInput("");
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (viewerRef.current?.requestFullscreen)
        await viewerRef.current.requestFullscreen();
      else if (videoRef.current?.webkitEnterFullscreen)
        videoRef.current.webkitEnterFullscreen();
      else
        cast.setError(
          "Fullscreen is not available in this browser. Rotate your phone for a larger view.",
        );
    } catch {
      cast.setError(
        "Fullscreen is unavailable. Rotate your phone for a larger view.",
      );
    }
  }
  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand" onClick={home} aria-label="Relay home">
          <span className="brand-symbol">
            <MonitorUp size={22} strokeWidth={2.1} />
          </span>
          relay<span className="brand-period">.</span>
        </button>
        <span className="header-divider" />
        <span className="header-label">
          A little closer. A little more connected.
        </span>
        <div className="header-actions">
          <span className={`network-status ${cast.online ? "" : "offline"}`}>
            <span className="status-dot" />
            {cast.online ? "Sharing server online" : "Connecting to server"}
          </span>
          <span className="header-divider" />
          <button
            className="icon-button"
            title="Connection help"
            aria-label="Connection help"
            onClick={() => setModal("help")}
          >
            <CircleHelp size={19} />
          </button>
          <button
            className="icon-button"
            title="Stream settings"
            aria-label="Stream settings"
            onClick={() => setModal("settings")}
          >
            <Settings2 size={19} />
          </button>
        </div>
      </header>

      <main>
        <div className="workspace-line">
          <span>
            <span className="workspace-dot" /> YOUR WORKSPACE{" "}
            <span className="workspace-slash">/</span>{" "}
            <span className="workspace-current">Screen sharing</span>
          </span>
          <span className="local-tag">
            <Wifi size={13} />{" "}
            {networkMode === "internet" ? "INTERNET" : "LOCAL PREVIEW"}
          </span>
        </div>
        {groupOpen ? (
          <GroupRoom onBack={home} />
        ) : cast.role === "home" ? (
          <>
            <section className="page-heading">
              <div className="eyebrow">
                <span /> TWO DEVICES. ONE CONNECTION.
              </div>
              <h1>Which device is this?</h1>
              <p>
                Your PC screen, on your phone. Pick a device to get connected.
              </p>
            </section>
            <div className="device-grid">
              <button
                className="device-card sender-card"
                onClick={() => cast.selectRole("pc")}
              >
                <div className="card-topline">
                  <span className="device-role">
                    <Monitor size={15} /> THE SENDER
                  </span>
                  <span className="step-number">01</span>
                </div>
                <DeviceArtwork />
                <div className="card-copy">
                  <h2>
                    This device is my PC <ArrowUpRight size={23} />
                  </h2>
                  <p>The screen you want to share.</p>
                </div>
                <div className="card-action">
                  <span>Set up your PC</span>
                  <span className="action-arrow">
                    <ArrowRight size={18} />
                  </span>
                </div>
              </button>
              <button
                className="device-card receiver-card"
                onClick={() => cast.selectRole("phone")}
              >
                <div className="card-topline">
                  <span className="device-role">
                    <Smartphone size={15} /> THE RECEIVER
                  </span>
                  <span className="step-number">02</span>
                </div>
                <DeviceArtwork phone />
                <div className="card-copy">
                  <h2>
                    This device is my phone <ArrowDownLeft size={23} />
                  </h2>
                  <p>A new home for your PC screen.</p>
                </div>
                <div className="card-action">
                  <span>Connect your phone</span>
                  <span className="action-arrow">
                    <ArrowRight size={18} />
                  </span>
                </div>
              </button>
            </div>
            <button
              className="home-group-option"
              onClick={() => {
                cast.selectRole("home");
                setGroupOpen(true);
              }}
            >
              <span className="home-group-icon">
                <Users size={22} />
              </span>
              <span>
                <strong>Group</strong>
                <small>
                  Create or join a group for voice and screen sharing.
                </small>
              </span>
              <span className="home-group-action">
                Create / Join <ArrowRight size={17} />
              </span>
            </button>
            <div className="trust-row">
              <span>
                <Wifi size={15} />{" "}
                {relayConfigured
                  ? "TURN relay configured"
                  : "STUN available / TURN not configured"}
              </span>
              <span>
                <LockKeyhole size={15} /> Encrypted screen & voice
              </span>
              <span>
                <Check size={15} /> No app to install
              </span>
            </div>
            <div className="network-note">
              <span className="note-icon">
                <Link2 size={19} />
              </span>
              <div>
                <strong>
                  {networkMode === "internet"
                    ? "One code. Different networks."
                    : "Local preview / public hosting not configured"}
                </strong>
                <p>
                  {networkMode === "internet"
                    ? relayConfigured
                      ? "Share your website address and pairing code with someone you trust."
                      : "TURN is missing. Some mobile and restricted networks cannot connect."
                    : "Remote access needs a public HTTPS website and a TURN relay."}
                </p>
              </div>
              <button className="text-button" onClick={() => setModal("help")}>
                Connection details <ArrowUpRight size={15} />
              </button>
            </div>
          </>
        ) : (
          <>
            <button className="back-button" onClick={home}>
              <ArrowLeft size={16} /> All devices
            </button>
            <section className="page-heading session-heading">
              <div className="eyebrow">
                <span />{" "}
                {cast.role === "pc"
                  ? "YOUR PC / SENDER"
                  : "YOUR PHONE / RECEIVER"}
              </div>
              <h1>
                {cast.role === "pc"
                  ? "Make room for another screen."
                  : "Your PC. Now within reach."}
              </h1>
              <p>
                {cast.role === "pc"
                  ? "Pair your phone, then choose the screen you want to share."
                  : "Enter the six-digit pairing code displayed on your PC."}
              </p>
            </section>
            <div
              className={`session-grid ${cast.role === "phone" && cast.stream ? "viewer-mode" : ""}`}
            >
              <section className="pairing-panel">
                <div className="panel-label">
                  {cast.role === "pc" ? (
                    <Monitor size={18} />
                  ) : (
                    <Smartphone size={18} />
                  )}{" "}
                  {cast.role === "pc"
                    ? "Your pairing code"
                    : "Connect to your PC"}
                  <span className="small-badge">
                    {cast.role === "pc" ? "SENDER" : "RECEIVER"}
                  </span>
                </div>
                {cast.role === "pc" ? (
                  <>
                    <div
                      className="pairing-code"
                      aria-label={
                        cast.code
                          ? `Pairing code ${cast.code}`
                          : "Generating code"
                      }
                    >
                      {Array.from({ length: 6 }, (_, index) => (
                        <span key={index}>{cast.code[index] || "-"}</span>
                      ))}
                    </div>
                    <div className="code-meta">
                      <span>
                        <span
                          className={`status-dot ${connected ? "" : "amber"}`}
                        />
                        {cast.code
                          ? cast.phoneConnected
                            ? "Phone paired"
                            : remaining
                              ? `Expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
                              : "Code expired"
                          : cast.status === "expired"
                            ? "Code expired"
                            : "Generating code..."}
                      </span>
                      <button
                        className="text-button"
                        disabled={!cast.code}
                        onClick={() => copy(cast.code, "code")}
                      >
                        {copied === "code" ? (
                          <Check size={14} />
                        ) : (
                          <Copy size={14} />
                        )}
                        {copied === "code" ? "Copied" : "Copy code"}
                      </button>
                      <button
                        className="icon-button small"
                        title="Generate a new code and disconnect"
                        aria-label="Generate a new code and disconnect"
                        disabled={!cast.online}
                        onClick={cast.refreshCode}
                      >
                        <RefreshCw size={15} />
                      </button>
                    </div>
                    <div className="panel-rule" />
                    <label className="field-label" htmlFor="quality">
                      Stream quality
                    </label>
                    <div className="select-wrap">
                      <select
                        id="quality"
                        value={cast.quality}
                        onChange={(event) =>
                          cast.setQuality(event.target.value)
                        }
                        disabled={cast.sharing || cast.capturing}
                      >
                        <option value="1080">1080p / Full HD</option>
                        <option value="720">720p / Balanced</option>
                        <option value="480">480p / Low bandwidth</option>
                      </select>
                      <ChevronDown size={15} />
                    </div>
                    <label className="toggle-row">
                      <span>
                        <Mic size={16} /> Share microphone
                      </span>
                      <input
                        type="checkbox"
                        checked={cast.microphone}
                        disabled={cast.sharing || cast.capturing}
                        onChange={(event) =>
                          cast.setMicrophone(event.target.checked)
                        }
                      />
                      <span className="toggle-track" />
                    </label>
                    {cast.sharing && cast.microphone && (
                      <button
                        className="text-button"
                        onClick={cast.toggleMicrophone}
                      >
                        {cast.microphoneMuted ? (
                          <MicOff size={16} />
                        ) : (
                          <Mic size={16} />
                        )}
                        {cast.microphoneMuted
                          ? "Unmute microphone"
                          : "Mute microphone"}
                      </button>
                    )}
                    <label className="toggle-row">
                      <span>
                        <Volume2 size={16} /> Share system audio
                      </span>
                      <input
                        type="checkbox"
                        checked={cast.audio}
                        disabled={cast.sharing || cast.capturing}
                        onChange={(event) =>
                          cast.setAudio(event.target.checked)
                        }
                      />
                      <span className="toggle-track" />
                    </label>
                    <button
                      className={`primary-button ${cast.sharing ? "stop-button" : ""}`}
                      disabled={!cast.online || !cast.code || cast.capturing}
                      onClick={
                        cast.sharing ? cast.disconnect : cast.startSharing
                      }
                    >
                      {cast.capturing ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : cast.sharing ? (
                        <Square size={16} />
                      ) : (
                        <MonitorUp size={18} />
                      )}
                      {cast.capturing
                        ? "Starting capture..."
                        : cast.sharing
                          ? "Stop sharing"
                          : "Choose a screen"}
                      {!cast.sharing && <ArrowRight size={17} />}
                    </button>
                    <p className="subtle-note">
                      <ShieldCheck size={13} /> Only the screen you choose will
                      be shared.
                    </p>
                    <div className="address-area">
                      <span className="field-label">OPEN ON YOUR PHONE</span>
                      {network.length ? (
                        network.map((url) => (
                          <div className="network-url" key={url}>
                            <a href={url} target="_blank" rel="noreferrer">
                              {url}
                              <ExternalLink size={12} />
                            </a>
                            <button
                              className="icon-button small"
                              title="Copy phone address"
                              aria-label={`Copy ${url}`}
                              onClick={() => copy(url, url)}
                            >
                              {copied === url ? (
                                <Check size={14} />
                              ) : (
                                <Copy size={14} />
                              )}
                            </button>
                          </div>
                        ))
                      ) : (
                        <span className="subtle-note">
                          No share address configured. Set a public HTTPS URL
                          for remote access.
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      cast.join(input);
                    }}
                  >
                    <label
                      className="field-label phone-code-label"
                      htmlFor="phone-code"
                    >
                      SIX-DIGIT PAIRING CODE
                    </label>
                    <input
                      id="phone-code"
                      className="code-input"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      autoComplete="off"
                      placeholder="000000"
                      value={input}
                      disabled={phoneBusy}
                      onChange={(event) =>
                        setInput(
                          event.target.value.replace(/\D/g, "").slice(0, 6),
                        )
                      }
                      required
                    />
                    <button
                      className="primary-button"
                      type={phoneBusy ? "button" : "submit"}
                      disabled={
                        !cast.online || (!phoneBusy && input.length !== 6)
                      }
                      onClick={phoneBusy ? cast.disconnect : undefined}
                    >
                      {phoneBusy ? (
                        cast.status === "joining" ||
                        cast.status === "connecting" ? (
                          <LoaderCircle size={18} className="spin" />
                        ) : (
                          <Link2 size={18} />
                        )
                      ) : (
                        <Link2 size={18} />
                      )}
                      {phoneBusy ? "Disconnect" : "Connect to PC"}
                      {!phoneBusy && <ArrowRight size={17} />}
                    </button>
                    <div className="phone-connection-state" aria-live="polite">
                      {connected ? (
                        <>
                          <Check size={16} /> Connected to your PC
                        </>
                      ) : cast.status === "waiting-screen" ? (
                        <>
                          <LoaderCircle className="spin" size={16} /> Waiting
                          for PC to share a screen
                        </>
                      ) : ["joining", "connecting"].includes(cast.status) ? (
                        <>
                          <LoaderCircle className="spin" size={16} /> Connecting
                          to your PC...
                        </>
                      ) : (
                        <>
                          <LockKeyhole size={14} /> A private, direct
                          connection.
                        </>
                      )}
                    </div>
                    <div className="phone-network">
                      <Wifi size={18} />
                      <p>
                        {networkMode === "internet"
                          ? "Different Wi-Fi or mobile data is OK."
                          : "This is a local preview."}
                        <br />
                        <span>
                          {networkMode === "internet"
                            ? "Open the same website as your PC."
                            : "Remote access needs public hosting."}
                        </span>
                      </p>
                    </div>
                  </form>
                )}
              </section>
              <section className="stream-section">
                <div className="stream-title">
                  <span>
                    <span
                      className={`status-dot ${connected ? "" : "amber"}`}
                    />
                    {statusText}
                  </span>
                  <span className="preview-label">
                    {cast.role === "pc" ? "LOCAL PREVIEW" : "PC SCREEN"}
                  </span>
                </div>
                <div
                  className={`stream-view ${cast.stream ? "has-stream" : ""}`}
                  ref={viewerRef}
                >
                  {cast.stream ? (
                    <VideoView
                      stream={cast.stream}
                      muted={cast.role === "pc" || muted}
                      videoRef={videoRef}
                      onError={cast.setError}
                    />
                  ) : (
                    <div className="empty-stream">
                      <div className="empty-device">
                        <Monitor size={53} strokeWidth={1} />
                        <span>
                          <Smartphone size={21} strokeWidth={1.5} />
                        </span>
                      </div>
                      <h3>
                        {cast.role === "pc"
                          ? "Your screen goes here"
                          : "Ready when your PC is"}
                      </h3>
                      <p>
                        {cast.role === "pc"
                          ? "Choose a screen to start your preview."
                          : "Pair with your PC to see its screen here."}
                      </p>
                      <span className="encrypted-label">
                        <LockKeyhole size={12} /> END-TO-END ENCRYPTED
                      </span>
                    </div>
                  )}
                  {cast.stream && (
                    <div className="fullscreen-toolbar">
                      <button
                        className="icon-button"
                        aria-label="Exit or enter fullscreen"
                        title="Toggle fullscreen"
                        onClick={fullscreen}
                      >
                        <Expand size={20} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="stream-toolbar">
                  <span>
                    <Radio size={14} />
                    {cast.stream
                      ? cast.role === "pc"
                        ? "Screen capture active"
                        : connected
                          ? "Live screen"
                          : "Connecting video"
                      : "No screen shared yet"}
                  </span>
                  <div>
                    <button
                      className="icon-button small"
                      aria-label={paused ? "Resume playback" : "Pause playback"}
                      title={paused ? "Resume playback" : "Pause playback"}
                      disabled={!cast.stream}
                      onClick={() => {
                        if (paused)
                          videoRef.current
                            ?.play()
                            .catch(() =>
                              cast.setError(
                                "Playback could not resume. Try reconnecting.",
                              ),
                            );
                        else videoRef.current?.pause();
                        setPaused(!paused);
                      }}
                    >
                      {paused ? <Play size={16} /> : <Pause size={16} />}
                    </button>
                    {cast.role === "phone" && (
                      <button
                        className="icon-button small"
                        title={muted ? "Unmute audio" : "Mute audio"}
                        aria-label={muted ? "Unmute audio" : "Mute audio"}
                        disabled={!cast.stream}
                        onClick={() => {
                          const next = !muted;
                          setMuted(next);
                          if (videoRef.current) videoRef.current.muted = next;
                        }}
                      >
                        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                      </button>
                    )}
                    <button
                      className="icon-button small"
                      title="Fullscreen"
                      aria-label="Fullscreen"
                      disabled={!cast.stream}
                      onClick={fullscreen}
                    >
                      <Expand size={16} />
                    </button>
                  </div>
                </div>
                <div className="session-note">
                  <ShieldCheck size={16} />
                  <p>
                    Your screen stays between your devices.
                    <br />
                    <span>No recordings. No cloud video storage.</span>
                  </p>
                </div>
              </section>
            </div>
            {cast.error && (
              <div className="error-message" role="alert">
                <CircleHelp size={17} />
                <span>{cast.error}</span>
                <button
                  className="icon-button small"
                  aria-label="Dismiss error"
                  onClick={() => cast.setError("")}
                >
                  <X size={15} />
                </button>
              </div>
            )}
            <div className="display-disclaimer">
              <Monitor size={16} />
              <p>
                Relay mirrors a screen. A true extended desktop needs a virtual
                display driver on your PC.
                <button
                  className="text-button"
                  onClick={() => setModal("help")}
                >
                  Learn more <ArrowUpRight size={13} />
                </button>
              </p>
            </div>
          </>
        )}
      </main>
      <footer>
        <span className="footer-brand">
          <MonitorUp size={15} /> Less distance. More screen.
        </span>
        <span>
          Screen and voice, connected.
          <span className="footer-dot" /> Powered by WebRTC
        </span>
        <span className="footer-private">
          <ShieldCheck size={13} /> Private by design
        </span>
      </footer>
      <dialog
        ref={dialogRef}
        className="modal"
        onCancel={() => setModal(null)}
        onClick={(event) => {
          if (event.target === dialogRef.current) setModal(null);
        }}
      >
        <div className="modal-heading">
          <span>
            {modal === "settings" ? (
              <Settings2 size={19} />
            ) : (
              <CircleHelp size={19} />
            )}
            {modal === "settings" ? "Stream settings" : "Connection details"}
          </span>
          <button
            className="icon-button"
            title="Close"
            aria-label="Close dialog"
            onClick={() => setModal(null)}
          >
            <X size={19} />
          </button>
        </div>
        {modal === "settings" ? (
          <div className="modal-body">
            <label className="field-label" htmlFor="global-quality">
              Stream quality
            </label>
            <div className="select-wrap">
              <select
                id="global-quality"
                disabled={cast.sharing || cast.capturing}
                value={cast.quality}
                onChange={(event) => cast.setQuality(event.target.value)}
              >
                <option value="1080">1080p / Full HD</option>
                <option value="720">720p / Balanced</option>
                <option value="480">480p / Low bandwidth</option>
              </select>
              <ChevronDown size={15} />
            </div>
            <label className="toggle-row">
              <span>
                <Mic size={16} /> Share microphone
              </span>
              <input
                type="checkbox"
                checked={cast.microphone}
                disabled={cast.sharing || cast.capturing}
                onChange={(event) => cast.setMicrophone(event.target.checked)}
              />
              <span className="toggle-track" />
            </label>
            <label className="toggle-row">
              <span>
                <Volume2 size={16} /> Share system audio
              </span>
              <input
                type="checkbox"
                checked={cast.audio}
                disabled={cast.sharing || cast.capturing}
                onChange={(event) => cast.setAudio(event.target.checked)}
              />
              <span className="toggle-track" />
            </label>
            <p className="modal-caption">
              Microphone requires permission on the PC. System audio depends on
              the selected screen or tab. Changes apply to the next capture.
              Voice is sent from the PC to the receiver, not a two-way call.
            </p>
          </div>
        ) : (
          <div className="modal-body help-content">
            <h3>One website. One pairing code.</h3>
            <p>
              Open the same public HTTPS website on both devices. Create a code
              on your PC and give it only to the intended receiver. The receiver
              can use a phone or another computer, on a different Wi-Fi or
              mobile network. Local LAN addresses below, if shown, are not
              reachable from other networks.
            </p>
            {network.map((url) => (
              <div className="network-url" key={url}>
                <a href={url} target="_blank" rel="noreferrer">
                  {url}
                </a>
                <button
                  className="icon-button small"
                  title="Copy address"
                  aria-label={`Copy ${url}`}
                  onClick={() => copy(url, url)}
                >
                  {copied === url ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            ))}
            <h3>A note about HTTPS</h3>
            <p>
              Internet sharing requires a publicly reachable HTTPS host,
              WebSocket support, and a TURN relay for restricted networks. If
              this installation is marked Local preview, it has not been
              publicly deployed. Local development uses a self-signed
              certificate; public hosting must use a trusted certificate.
            </p>
            <h3>About a second screen</h3>
            <p>
              Relay displays your PC screen on your phone; it does not create a
              new Windows display. To extend your desktop, install a trusted
              virtual display driver separately, enable Extend in Windows
              display settings, then select that display when sharing.
            </p>
            <p className="modal-caption">
              If pairing works but video does not, check TURN configuration,
              firewall restrictions, and browser network permissions. Allow the
              PC microphone to share voice, and unmute audio on the receiver.
              Pairing codes expire after 10 minutes; connected sessions
              continue. A code gives access to your screen: never post it
              publicly.
            </p>
          </div>
        )}
      </dialog>
    </div>
  );
}
