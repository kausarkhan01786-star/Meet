import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  Circle,
  Copy,
  Download,
  Headphones,
  Hand,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MoreHorizontal,
  Phone,
  PhoneOff,
  Plus,
  Send,
  Settings2,
  ShieldCheck,
  Square,
  Users,
  Volume2,
  VolumeX,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { useGroup } from "./useGroup";
import {
  CameraTile,
  MemberAudio,
  SharedScreen,
  SoundToggle,
  useAudioActivity,
} from "./MediaViews";
import { saveMeetingSession } from "./meetingSession.js";
import { saveMeetingRecording } from "./meetingRecording.js";
import { ChatAttachments, MemberActions, MemberLocation, MeetingReactions, ReactionControls, RichMessage, RoleBadge } from "./MeetingTools";

function ChatPanel({ group, tab, setTab, onClose, isRecording, startRecording, stopRecording, recordingMessage, savedRecording }) {
  const [draft, setDraft] = useState("");
  const chatDisabled = group.room?.chatEnabled === false;
  const cannotSend = !group.room || !group.online || chatDisabled;
  const everyoneMicLocked = Boolean(group.self?.micLocked || group.members.some((member) => member.micLocked));
  const bottomRef = useRef(null);
  useEffect(() => {
    setDraft("");
  }, [group.room?.selfId]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [group.messages.length]);
  function submit(event) {
    event.preventDefault();
    if (group.sendMessage(draft)) setDraft("");
  }
  return (
    <aside className="meeting-sidebar" aria-label="Meeting sidebar">
      <div className="sidebar-top">
        <div className="sidebar-tabs" role="tablist" aria-label="Meeting panel">
          <button
            role="tab"
            aria-selected={tab === "chat"}
            onClick={() => setTab("chat")}
          >
            <MessageSquare size={13} /> Chat
          </button>
          <button
            role="tab"
            aria-selected={tab === "people"}
            onClick={() => setTab("people")}
          >
            <Users size={13} /> People{" "}
            <span>{group.room ? group.members.length + 1 : 0}</span>
          </button>
          {group.isAdmin && <button
            role="tab"
            aria-selected={tab === "permissions"}
            onClick={() => setTab("permissions")}
          >
            <ShieldCheck size={13} /> Permission{" "}
            {group.admissionRequests.length > 0 && <span className="admission-count" aria-label={`${group.admissionRequests.length} pending rejoin requests`}>{group.admissionRequests.length}</span>}
          </button>}
          <button role="tab" aria-selected={tab === "others"} onClick={() => setTab("others")}>
            <MoreHorizontal size={13} /> Others
            {group.recordingParticipants.length > 0 && <span className="recording-count" aria-label={`${group.recordingParticipants.length} active recordings`}>{group.recordingParticipants.length}</span>}
          </button>
        </div>
        <button
          className="m-icon close-sidebar"
          aria-label="Close chat panel"
          title="Close panel"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      {group.isAdmin && <div className="meeting-admin-bar"><label><span><ShieldCheck size={13} /> Meeting chat</span><input type="checkbox" aria-label="Enable meeting chat" checked={group.room?.chatEnabled !== false} onChange={(event) => group.adminAction("chat", { enabled: event.target.checked })} /></label>{tab === "people" && <button title={everyoneMicLocked ? "Allow everyone to unmute their microphone" : "Mute everyone and prevent self-unmute"} onClick={() => group.adminAction(everyoneMicLocked ? "unmute-all" : "mute-all")}>{everyoneMicLocked ? <Mic size={14} /> : <MicOff size={14} />}{everyoneMicLocked ? "Allow unmute" : "Mute everyone"}</button>}</div>}
      {tab === "chat" && chatDisabled && <div className="chat-disabled-note" role="status"><LockKeyhole size={12} /> Chat is disabled by an admin.</div>}
      {tab === "chat" ? (
        <>
          <div
            className="chat-messages"
            role="log"
            aria-label="Meeting messages"
            aria-live="polite"
          >
            {!group.messages.length && (
              <div className="chat-empty">
                <span>
                  <MessageSquare size={25} strokeWidth={1.2} />
                </span>
                <h3>A little side conversation.</h3>
                <p>
                  {group.room
                    ? "Your room's messages will appear here."
                    : "Chat opens when your meeting begins."}
                </p>
              </div>
            )}
            {group.messages.map((message) => (
              <article
                key={message.id}
                className={`chat-message ${message.senderId === group.room?.selfId ? "is-own" : ""}`}
              >
                <div className="chat-message-meta">
                  <strong>
                    {message.senderId === group.room?.selfId
                      ? "You"
                      : message.name}
                  </strong>
                  <time>
                    {new Date(message.sentAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <RichMessage message={message} />
              </article>
            ))}
            <div ref={bottomRef} />
          </div>
          <form className="chat-composer" onSubmit={submit}>
            <label className="sr-only" htmlFor="meeting-message">
              Message your meeting
            </label>
            <textarea
              id="meeting-message"
              placeholder="Send a message..."
              rows={2}
              maxLength={2000}
              disabled={cannotSend}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  if (draft.trim()) event.currentTarget.form.requestSubmit();
                }
              }}
            />
            <ChatAttachments disabled={cannotSend} onEmoji={(emoji) => setDraft((current) => (current + emoji).slice(0, 2000))} onSendFile={group.sendFile} />
            <div>
              <span>
                <LockKeyhole size={11} /> Only in this meeting
              </span>
              <button
                type="submit"
                aria-label="Send message"
                title="Send message"
                disabled={cannotSend || !draft.trim()}
              >
                <Send size={15} />
              </button>
            </div>
          </form>
        </>
      ) : tab === "people" ? (
        <div className="people-list">
          {!group.room ? (
            <div className="chat-empty">
              <Users size={27} />
              <h3>Your people belong here.</h3>
            </div>
          ) : (
            <>
              <div className="person-row">
                <span className="person-avatar">YOU</span>
                <div>
                  <strong>You <RoleBadge role={group.self?.role} /></strong>
                  <small>
                    {group.muted ? "Microphone off" : "Microphone on"}
                  </small>
                </div>
                {group.self?.handRaised && <Hand size={15} className="raised-hand-icon" aria-label="Your hand is raised" />}
                {group.muted ? <MicOff size={15} /> : <Mic size={15} />}
              </div>
              {group.members.map((member) => (
                <div className="person-row" key={member.id}>
                  <span className="person-avatar">
                    {member.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <strong>{member.name} <RoleBadge role={member.role} /></strong>
                    <small>
                      {group.connections[member.id] === "connected"
                        ? member.sharing
                          ? "Sharing screen"
                          : member.muted
                            ? "Microphone off"
                            : "Connected"
                        : "Connecting..."}
                    </small>
                  </div>
                  {member.handRaised && <Hand size={15} className="raised-hand-icon" aria-label={`${member.name}'s hand is raised`} />}
                  {member.muted ? <MicOff size={15} /> : <Mic size={15} />}
                  <MemberActions group={group} member={member} />
                  {group.isAdmin && <MemberLocation member={member} />}
                </div>
              ))}
            </>
          )}
        </div>
      ) : tab === "permissions" ? (
        <div className="admission-requests-list" aria-live="assertive">
          <div className="admission-banner-heading"><strong>Rejoin requests</strong><span>{group.admissionRequests.length} waiting</span></div>
          {group.admissionRequests.length ? group.admissionRequests.map((request) => <div className="admission-request-row" key={request.id}><span><strong>{request.name}</strong><small>Wants to rejoin this meeting</small></span><button className="admission-accept" onClick={() => group.decideAdmission(request.id, true)}><Check size={14} /> Accept</button><button className="admission-reject" onClick={() => group.decideAdmission(request.id, false)}><X size={14} /> Reject</button></div>) : <p className="admission-requests-empty">No rejoin requests right now.</p>}
        </div>
      ) : (
        <div className="others-panel">
          <h3>Meeting recording</h3>
          <p>Record the meeting screen and audio, then save the video on this device.</p>
          {group.self?.role === "owner" && <label className="recording-permission-setting"><span><strong>Allow meeting recording</strong><small>Anyone in this meeting can record and save a local copy.</small></span><input type="checkbox" checked={group.room?.recordingAllowed === true} onChange={(event) => group.adminAction("recording-permission", { enabled: event.target.checked })} /></label>}
          {group.recordingParticipants.length > 0 && <div className="recording-live-status"><i /> Recording: {group.recordingParticipants.map((participant) => participant.id === group.room?.selfId ? "You" : participant.name).join(", ")}</div>}
          <button className={`stage-record-button ${isRecording ? "is-recording" : ""}`} disabled={!group.room?.recordingAllowed && !isRecording} title={!group.room?.recordingAllowed && !isRecording ? "The owner has disabled recording" : isRecording ? "Stop and save the recording" : "Record this meeting to this device"} onClick={isRecording ? stopRecording : startRecording}>
            {isRecording ? <Square size={14} /> : <Circle size={14} />}
            {isRecording ? "Stop & save" : "Record meeting"}
          </button>
          <small className="recording-help">Choose the meeting tab or screen in your browser’s sharing prompt.</small>
          {recordingMessage && <span className="recording-message" role="status">{recordingMessage}</span>}
          {savedRecording && <a className="recording-download" href={savedRecording.url} download={savedRecording.name}><Download size={13} /> Download recording</a>}
        </div>
      )}
    </aside>
  );
}

function VoiceParticipant({
  name,
  avatarName = name,
  local = false,
  tone = 0,
  muted,
  stream,
  connected,
  handRaised = false,
}) {
  const speaking = useAudioActivity(stream, !muted);
  const status = muted
    ? "Microphone off"
    : speaking
      ? "Speaking"
      : local
        ? "Microphone on"
        : connected
          ? "Connected"
          : "Connecting...";
  return (
    <div
      role="group"
      className={`voice-person ${local ? "" : `tone-${tone}`} ${muted ? "is-muted" : ""} ${speaking ? "is-speaking" : ""}`}
      aria-label={`${name}: ${status}`}
    >
      <div className="voice-avatar">
        <span>{avatarName.slice(0, 2).toUpperCase()}</span>
        <i />
        <i />
        <i />
      </div>
      <strong>
        {name}
        {handRaised && <Hand size={14} className="raised-hand-icon" aria-label="Hand raised" />}
        {muted && <MicOff size={12} />}
        {local && !muted && <Mic size={12} />}
      </strong>
      <small>{status}</small>
    </div>
  );
}

export default function MeetingRoom({
  meetingType = "group",
  onBack,
  minimized = false,
  onMinimize,
  onRestore,
  initialSession = {},
}) {
  const group = useGroup({ meetingType });
  const single = meetingType === "single";
  const [mode, setMode] = useState(initialSession.mode || null);
  const [name, setName] = useState(initialSession.name || "");
  const [code, setCode] = useState(
    initialSession.roomCode || initialSession.code || "",
  );
  const [needsReconnect, setNeedsReconnect] = useState(
    Boolean(initialSession.roomCode),
  );
  const [autoEnter, setAutoEnter] = useState(!initialSession.mode);
  const [copied, setCopied] = useState(false);
  const [speakersMuted, setSpeakersMuted] = useState(false);
  const [chatOpen, setChatOpen] = useState(
    () => initialSession.chatOpen ?? window.innerWidth > 1050,
  );
  const [tab, setTab] = useState(initialSession.tab || "chat");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMessage, setRecordingMessage] = useState("");
  const [savedRecording, setSavedRecording] = useState(null);
  const attemptedCode = useRef("");
  const creating = useRef(false);
  const copyTimer = useRef(null);
  const joinedAt = useRef(0);
  const minimizedVideoRef = useRef(null);
  const recorderSessionRef = useRef(null);
  const recordingUrlRef = useRef(null);
  const savedRoomCode = useRef(initialSession.roomCode || "");
  function connectRecordingAudio(session, streams) {
    for (const stream of streams) {
      for (const track of stream?.getAudioTracks?.() || []) {
        if (track.readyState !== "live" || session.trackIds.has(track.id)) continue;
        const source = session.audioContext.createMediaStreamSource(new MediaStream([track]));
        source.connect(session.audioDestination);
        session.trackIds.add(track.id);
        session.sources.push(source);
      }
    }
  }
  async function startRecording() {
    if (!group.room?.recordingAllowed || recorderSessionRef.current) return;
    if (!navigator.mediaDevices?.getDisplayMedia || !window.MediaRecorder) {
      setRecordingMessage("This browser cannot record the meeting screen.");
      return;
    }
    let displayStream;
    let audioContext;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 30 } }, audio: false });
      if (!displayStream.getVideoTracks().length) throw new Error("Choose a screen or meeting tab to record.");
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("This browser cannot mix meeting audio for recording.");
      audioContext = new AudioContextClass();
      await audioContext.resume();
      const audioDestination = audioContext.createMediaStreamDestination();
      const session = { displayStream, audioContext, audioDestination, trackIds: new Set(), sources: [], chunks: [], stopping: false };
      connectRecordingAudio(session, [group.localAudio, ...Object.values(group.streams)]);
      const recordedStream = new MediaStream([...displayStream.getVideoTracks(), ...audioDestination.stream.getAudioTracks()]);
      const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(recordedStream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 });
      session.recorder = recorder;
      session.finish = async () => {
        if (session.finished) return;
        session.finished = true;
        recorderSessionRef.current = null;
        displayStream.getTracks().forEach((track) => { track.onended = null; track.stop(); });
        try { await audioContext.close(); } catch {}
        group.reportRecording(false);
        setIsRecording(false);
        if (!session.chunks.length) {
          setRecordingMessage("No recording data was captured.");
          return;
        }
        const blob = new Blob(session.chunks, { type: recorder.mimeType || "video/webm" });
        const filename = `meeting-${group.room?.code || "recording"}-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
        try {
          await saveMeetingRecording({ id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, name: filename, meetingCode: group.room?.code || "", createdAt: Date.now(), blob });
          if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
          recordingUrlRef.current = URL.createObjectURL(blob);
          setSavedRecording({ name: filename, url: recordingUrlRef.current });
          setRecordingMessage("Recording saved on this device.");
        } catch (failure) {
          setRecordingMessage(failure.message || "Could not save the recording on this device.");
        }
      };
      recorder.ondataavailable = (event) => { if (event.data.size) session.chunks.push(event.data); };
      recorder.onstop = () => { void session.finish(); };
      recorder.onerror = () => { setRecordingMessage("Recording stopped because the browser reported an error."); stopRecording(); };
      displayStream.getVideoTracks()[0].onended = () => stopRecording();
      recorderSessionRef.current = session;
      recorder.start(1000);
      setRecordingMessage("");
      setIsRecording(true);
      setSavedRecording(null);
      group.reportRecording(true);
    } catch (failure) {
      recorderSessionRef.current = null;
      displayStream?.getTracks().forEach((track) => track.stop());
      try { await audioContext?.close(); } catch {}
      setRecordingMessage(failure.name === "NotAllowedError" ? "Screen sharing was cancelled." : failure.message || "Could not start the recording.");
    }
  }
  function stopRecording() {
    const session = recorderSessionRef.current;
    if (!session || session.stopping) return;
    session.stopping = true;
    if (session.recorder.state === "inactive") void session.finish();
    else session.recorder.stop();
  }
  useEffect(() => {
    const session = recorderSessionRef.current;
    if (session) connectRecordingAudio(session, [group.localAudio, ...Object.values(group.streams)]);
  }, [group.localAudio, group.streams]);
  useEffect(() => {
    if (recorderSessionRef.current && (!group.room?.recordingAllowed || group.recordingStopSignal)) stopRecording();
  }, [group.room?.recordingAllowed, group.recordingStopSignal, group.room?.selfId]);
  useEffect(() => () => {
    const session = recorderSessionRef.current;
    if (session?.recorder.state === "recording") session.recorder.stop();
    session?.displayStream.getTracks().forEach((track) => track.stop());
    try { session?.audioContext.close(); } catch {}
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
  }, []);
  useEffect(() => {
    saveMeetingSession({
      mode,
      name,
      code,
      tab,
      chatOpen,
      roomCode:
        group.room?.code || (needsReconnect ? savedRoomCode.current : ""),
    });
  }, [mode, name, code, tab, chatOpen, group.room?.code, needsReconnect]);
  const previewMember = group.members.find((member) => member.sharing);
  const cameraPreviewMember = group.members.find((member) => member.camera);
  const previewStream =
    group.localScreen ||
    (previewMember ? group.streams[previewMember.id] : null) ||
    group.localCamera ||
    (cameraPreviewMember ? group.cameraStreams[cameraPreviewMember.id] : null);
  useEffect(() => {
    const video = minimizedVideoRef.current;
    if (!minimized || !previewStream || !video) return;
    video.srcObject = previewStream;
    video.play().catch(() => {});
    return () => {
      video.srcObject = null;
    };
  }, [minimized, previewStream]);
  useEffect(() => {
    if (!autoEnter || needsReconnect) return;
    if (
      mode === "create" &&
      name.trim() &&
      group.online &&
      !group.room &&
      !creating.current
    ) {
      creating.current = true;
      group.enter("create", name.trim(), "");
    }
    if (
      mode === "join" &&
      name.trim() &&
      group.online &&
      code.length === 6 &&
      !group.room &&
      !group.joining &&
      attemptedCode.current !== code
    ) {
      attemptedCode.current = code;
      group.enter("join", name.trim(), code);
    }
  }, [
    mode,
    code,
    group.online,
    group.room,
    group.joining,
    name,
    autoEnter,
    needsReconnect,
  ]);
  useEffect(() => {
    if (!group.room) {
      joinedAt.current = 0;
      setElapsed(0);
      return;
    }
    joinedAt.current = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - joinedAt.current) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [group.room?.selfId]);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(group.room.code);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      group.setError(
        "Clipboard unavailable. Select and copy the code manually.",
      );
    }
  }
  function leave() {
    group.leave();
    setNeedsReconnect(false);
    setAutoEnter(true);
    savedRoomCode.current = "";
    setMode(null);
    setCode("");
    creating.current = false;
    attemptedCode.current = "";
  }
  function home() {
    if (group.room && onMinimize) {
      onMinimize();
      return;
    }
    group.leave();
    onBack();
  }
  const screenMembers = group.members.filter((member) => member.sharing);
  const screenCount = screenMembers.length + Number(group.sharing);
  const cameraCount =
    group.members.filter((member) => member.camera).length +
    Number(group.cameraOn);
  const cameraTiles = (
    <>
      <CameraTile
        stream={group.localCamera}
        name={name.trim() || (mode === "create" ? "Host" : "Guest")}
        local
        enabled={group.cameraOn}
        muted={group.muted}
      />
      {group.members.map((member) => (
        <CameraTile
          key={member.id}
          stream={group.cameraStreams[member.id]}
          name={member.name}
          enabled={member.camera}
          muted={member.muted}
        />
      ))}
    </>
  );
  const connectedCount = Object.values(group.connections).filter(
    (value) => value === "connected",
  ).length;
  const title = !mode
    ? single
      ? "A moment for just two."
      : "Bring your people together."
    : single && mode === "create"
      ? "Make room for another screen."
      : group.room
        ? single
          ? "Good to hear you."
          : "Your people, all here."
        : "A conversation starts here.";
  return (
    <>
      <div
        className={`meeting-workspace ${chatOpen ? "has-sidebar" : ""} ${group.room ? "is-in-call" : ""}`}
        hidden={minimized}
      >
        <MeetingReactions reactions={group.reactions} />
        <header className="meeting-header">
          <button
            className="workspace-brand"
            onClick={home}
            aria-label="Meeting home"
          >
            <AudioLines size={22} />
            <span>
              Meeting<span>.</span>
            </span>
          </button>
          <span className="workspace-header-divider" />
          <button
            className="meeting-type-label"
            onClick={() => {
              if (group.room) home();
              else if (mode) leave();
              else home();
            }}
          >
            <span className={`tiny-dot ${group.online ? "" : "is-offline"}`} />
            {single ? "Single meeting" : "Group meeting"}
            <ChevronDown size={13} />
          </button>
          {group.room && (
            <>
              <h1 className="header-room-title">{title}</h1>
              <div className="room-code-box header-room-code">
                <span>{single ? "PAIRING CODE" : "GROUP CODE"}</span>
                <div>
                  <strong aria-label={`Meeting code ${group.room.code}`}>
                    {group.room.code}
                  </strong>
                  <button
                    className="m-icon"
                    aria-label="Copy meeting code"
                    title={copied ? "Copied" : "Copy code"}
                    onClick={copyCode}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
            </>
          )}
          <div className="header-end">
            <SoundToggle />
            <span className="encryption-status">
              <ShieldCheck size={14} /> Encrypted media
            </span>
            <button
              className={`m-icon ${chatOpen ? "is-active" : ""}`}
              title="Open chat"
              aria-label="Open chat"
              onClick={() => {
                setTab("chat");
                setChatOpen(!chatOpen);
              }}
            >
              <MessageSquare size={19} />
            </button>
          </div>
        </header>
        <div className="meeting-workspace-body">
          <main className="meeting-main">
            {!group.room && (
              <>
                <div className="room-topline">
                  <button
                    className="workspace-back"
                    onClick={mode ? leave : home}
                  >
                    <ArrowLeft size={14} />
                    {mode ? "Meeting options" : "Back to the world"}
                  </button>
                  <span className="room-state">
                    <span
                      className={`tiny-dot ${connectedCount ? "" : "is-waiting"}`}
                    />
                    {connectedCount
                      ? `${connectedCount + 1} connected`
                      : group.room
                        ? "Waiting for company"
                        : group.joining
                          ? "Connecting"
                          : group.online
                            ? "Ready to connect"
                            : "Connecting to server"}
                  </span>
                </div>
                <section className="room-heading">
                  <div>
                    <div className="room-eyebrow">
                      {single ? "A LITTLE LESS DISTANCE" : "YOUR SHARED SPACE"}
                    </div>
                    <h1>{title}</h1>
                    <p>
                      {!mode
                        ? "Choose how your next conversation begins."
                        : group.room
                          ? connectedCount
                            ? "Your voices are connected. Your screens are next."
                            : "A conversation is one code away."
                          : mode === "create"
                            ? "Preparing your private room..."
                            : "Enter a six-digit code to connect."}
                    </p>
                  </div>
                </section>
              </>
            )}
            {!mode ? (
              <section className="meeting-entry">
                <label className="entry-name-label" htmlFor="display-name">
                  YOUR NAME <span>REQUIRED</span>
                </label>
                <input
                  className="meeting-name-input"
                  id="display-name"
                  placeholder="What should we call you?"
                  maxLength={40}
                  autoComplete="nickname"
                  required
                  aria-required="true"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <div className="entry-choice-grid">
                  <button
                    className="entry-choice"
                    disabled={!name.trim()}
                    onClick={() => {
                      creating.current = false;
                      setAutoEnter(true);
                      setMode("create");
                    }}
                  >
                    <span className="entry-choice-icon">
                      <Plus size={25} strokeWidth={1.3} />
                    </span>
                    <strong>
                      {single ? "Create call" : "Create new meeting"}
                      <ArrowUpRightIcon />
                    </strong>
                    <small>
                      {single
                        ? "Make a little space for someone."
                        : "One code. Everyone you want here."}
                    </small>
                    <span className="entry-choice-bottom">
                      {single ? "Start your conversation" : "Start your meeting"}
                      <ArrowRight size={17} />
                    </span>
                  </button>
                  <button
                    className="entry-choice receive-entry"
                    disabled={!name.trim()}
                    onClick={() => {
                      setAutoEnter(true);
                      setMode("join");
                    }}
                  >
                    <span className="entry-choice-icon">
                      <LogIn size={25} strokeWidth={1.3} />
                    </span>
                    <strong>
                      {single ? "Receive call" : "Join meeting"}
                      <ArrowUpRightIcon />
                    </strong>
                    <small>
                      {single
                        ? "Someone is waiting on the other side."
                        : "Your people have a place for you."}
                    </small>
                    <span className="entry-choice-bottom">
                      {single
                        ? "Enter a pairing code"
                        : "Join with a meeting code"}
                      <ArrowRight size={17} />
                    </span>
                  </button>
                </div>
              </section>
            ) : !group.room ? (
              <div className="meeting-join-stage">
                {needsReconnect ? (
                  <div className="room-preparing reconnect-panel">
                    <Phone size={36} strokeWidth={1.2} />
                    <h2>Your meeting page is back.</h2>
                    <p>
                      Refreshing disconnected the previous call. Reconnect to
                      rejoin if someone is still in the room.
                    </p>
                    <span className="reconnect-code">
                      {savedRoomCode.current}
                    </span>
                    <button
                      className="connect-call-button"
                      disabled={!group.online || !name.trim() || group.joining}
                      onClick={() => {
                        const previousCode = savedRoomCode.current;
                        attemptedCode.current = previousCode;
                        setMode("join");
                        setCode(previousCode);
                        setNeedsReconnect(false);
                        setAutoEnter(true);
                        group.enter("join", name.trim(), previousCode);
                      }}
                    >
                      <Phone size={16} /> Reconnect to meeting
                    </button>
                    <button
                      className="workspace-back reconnect-back"
                      onClick={leave}
                    >
                      <ArrowLeft size={14} /> Meeting options
                    </button>
                  </div>
                ) : mode === "join" ? (
                  <form
                    className="receive-call-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      group.enter("join", name.trim(), code);
                    }}
                  >
                    <div className="receive-call-symbol">
                      <LogIn size={31} strokeWidth={1.2} />
                    </div>
                    <h2>
                      {group.admissionStatus === "pending"
                        ? "Waiting for rejoin approval."
                        : single
                        ? "You're six digits away."
                        : "Join your meeting."}
                    </h2>
                    {group.admissionStatus === "pending" && <p className="admission-waiting-note" role="status">The Owner or an Admin will review your request. Please keep this page open.</p>}
                    <label htmlFor="join-display-name">
                      YOUR NAME <span>REQUIRED</span>
                    </label>
                    <input
                      id="join-display-name"
                      className="name-input"
                      placeholder="What should we call you?"
                      maxLength={40}
                      autoComplete="nickname"
                      required
                      autoFocus
                      value={name}
                      disabled={group.joining || group.admissionStatus === "pending"}
                      onChange={(event) => setName(event.target.value)}
                    />
                    <label htmlFor="meeting-code">
                      {single ? "PAIRING CODE" : "MEETING CODE"}
                    </label>
                    <input
                      id="meeting-code"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={6}
                      pattern="[0-9]{6}"
                      placeholder="000000"
                      value={code}
                      disabled={group.joining || group.admissionStatus === "pending"}
                      required
                      onChange={(event) => {
                        setAutoEnter(true);
                        setCode(
                          event.target.value.replace(/\D/g, "").slice(0, 6),
                        );
                      }}
                    />
                    <p className="location-sharing-note">Your browser will ask to share your location. Meeting admins can view it on a map.</p>
                    <button
                      className="connect-call-button"
                      disabled={
                        !group.online ||
                        group.joining ||
                        group.admissionStatus === "pending" ||
                        !name.trim() ||
                        code.length !== 6
                      }
                    >
                      {group.joining ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <ArrowRight size={16} />
                      )}
                      {group.joining ? "Connecting..." : group.admissionStatus === "pending" ? "Waiting for approval" : "Connect"}
                    </button>
                    <span className="join-secure">
                      <LockKeyhole size={12} /> The code stays between your
                      people.
                    </span>
                  </form>
                ) : (
                  <form
                    className="receive-call-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      group.enter("create", name.trim(), "");
                    }}
                  >
                    <div className="receive-call-symbol">
                      <Plus size={31} strokeWidth={1.2} />
                    </div>
                    <h2>Create a new meeting.</h2>
                    <label htmlFor="create-display-name">
                      YOUR NAME <span>REQUIRED</span>
                    </label>
                    <input
                      id="create-display-name"
                      className="name-input"
                      placeholder="What should we call you?"
                      maxLength={40}
                      autoComplete="nickname"
                      required
                      autoFocus
                      value={name}
                      disabled={group.joining}
                      onChange={(event) => setName(event.target.value)}
                    />
                    <p className="location-sharing-note">Your browser will ask to share your location. Meeting admins can view it on a map.</p>
                    <button
                      className="connect-call-button"
                      disabled={
                        !group.online || group.joining || !name.trim()
                      }
                    >
                      {group.joining ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <Plus size={16} />
                      )}
                      {group.joining ? "Creating..." : "Create meeting"}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <section
                className={`meeting-stage ${screenCount ? "is-screen-stage" : ""}`}
                aria-label="Call stage"
              >
                {screenCount ? (
                  <div className="meeting-screens">
                    {group.sharing && (
                      <SharedScreen
                        stream={group.localScreen}
                        name="You"
                        local
                      />
                    )}
                    {screenMembers.map((member) => (
                      <SharedScreen
                        key={member.id}
                        stream={group.streams[member.id]}
                        name={member.name}
                      />
                    ))}
                  </div>
                ) : cameraCount ? (
                  <div className="camera-grid">{cameraTiles}</div>
                ) : (
                  <div className="voice-room">
                    <div className="voice-room-top">
                      <span className="voice-live">
                        <AudioLines size={13} />{" "}
                        {connectedCount
                          ? "VOICE CONNECTED"
                          : "YOUR ROOM IS OPEN"}
                      </span>
                      <span>
                        {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
                        {String(elapsed % 60).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="voice-members">
                      <VoiceParticipant
                        name="You"
                        avatarName={name.trim() || "You"}
                        local
                        muted={group.muted}
                        handRaised={group.self?.handRaised}
                        stream={group.localAudio}
                      />
                      {group.members.map((member, index) => (
                        <VoiceParticipant
                          key={member.id}
                          name={member.name}
                          tone={index % 3}
                          muted={member.muted}
                          handRaised={member.handRaised}
                          stream={group.streams[member.id]}
                          connected={
                            group.connections[member.id] === "connected"
                          }
                        />
                      ))}
                    </div>
                    <div className="voice-room-message">
                      <h2>
                        {connectedCount
                          ? "This is what closer sounds like."
                          : "A little company, one code away."}
                      </h2>
                      <p>
                        {connectedCount
                          ? "No screen shared. Just a good conversation."
                          : "Your meeting is ready for someone to join."}
                      </p>
                    </div>
                    <div className="voice-room-bottom">
                      <LockKeyhole size={12} />
                      <span>
                        {single
                          ? "JUST THE TWO OF YOU"
                          : `UP TO ${group.room.limit} PEOPLE`}
                      </span>
                      <span className="voice-bottom-rule" />
                      <Headphones size={12} />
                      <span>VOICE & SCREEN</span>
                    </div>
                  </div>
                )}
              </section>
            )}
            {group.room && screenCount > 0 && cameraCount > 0 && (
              <div className="camera-strip" aria-label="Meeting cameras">
                {cameraTiles}
              </div>
            )}
            {group.error && (
              <div className="meeting-error" role="alert">
                <span>{group.error}</span>
                {!group.online && (
                  <button onClick={group.reconnect}>Reconnect</button>
                )}
                <button
                  className="m-icon"
                  aria-label="Dismiss meeting error"
                  onClick={() => group.setError("")}
                >
                  <X size={15} />
                </button>
              </div>
            )}
            <div className="call-bottom-bar">
              <div className="call-bottom-info">
                <LockKeyhole size={12} />
                <span>{single ? "Single meeting" : "Group meeting"}</span>
                {group.room && (
                  <>
                    <span className="bottom-dot" />
                    <span>
                      {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
                      {String(elapsed % 60).padStart(2, "0")}
                    </span>
                  </>
                )}
              </div>
              <div className="call-controls">
                <ReactionControls group={group} />
                <button
                  className={`call-control camera-control ${group.cameraOn ? "camera-is-on" : "control-off"}`}
                  aria-label={
                    group.cameraOn ? "Turn camera off" : "Turn camera on"
                  }
                  title={group.cameraOn ? "Turn camera off" : "Turn camera on"}
                  disabled={!group.room || group.mediaBusy || group.self?.permissions?.camera === false}
                  onClick={group.toggleCamera}
                >
                  {group.cameraOn ? (
                    <Video size={20} />
                  ) : (
                    <VideoOff size={20} />
                  )}
                </button>
                <button
                  className={`call-control ${group.muted ? "control-off" : ""}`}
                  aria-label={
                    group.self?.micLocked ? "Microphone locked by meeting owner" : group.muted ? "Unmute microphone" : "Mute microphone"
                  }
                  title={group.self?.micLocked ? "The owner must allow unmuting" : group.muted ? "Unmute microphone" : "Mute microphone"}
                  disabled={!group.room || group.mediaBusy || group.self?.permissions?.microphone === false || group.self?.micLocked === true}
                  onClick={group.toggleMic}
                >
                  {group.muted ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <button
                  className={`call-control ${speakersMuted ? "control-off" : ""}`}
                  title={speakersMuted ? "Unmute speakers" : "Mute speakers"}
                  aria-label={
                    speakersMuted ? "Unmute speakers" : "Mute speakers"
                  }
                  onClick={() => setSpeakersMuted(!speakersMuted)}
                >
                  {speakersMuted ? (
                    <VolumeX size={20} />
                  ) : (
                    <Volume2 size={20} />
                  )}
                </button>
                <span className="controls-divider" />
                <button
                  className={`call-control share-control ${group.sharing ? "is-sharing" : ""}`}
                  title={group.sharing ? "Stop sharing" : "Share screen"}
                  aria-label={group.sharing ? "Stop sharing" : "Share screen"}
                  disabled={!group.room || group.mediaBusy}
                  onClick={group.shareScreen}
                >
                  {group.mediaBusy ? (
                    <LoaderCircle className="spin" size={19} />
                  ) : (
                    <MonitorUp size={20} />
                  )}
                  <span>{group.sharing ? "Stop sharing" : "Share screen"}</span>
                </button>
                <button
                  className="call-control more-control"
                  title="Call details"
                  aria-label="Call details"
                  onClick={() => setSettingsOpen(!settingsOpen)}
                >
                  <MoreHorizontal size={21} />
                </button>
                <span className="controls-divider" />
                <button
                  className="call-control hang-up"
                  title="Leave meeting"
                  aria-label="Leave meeting"
                  onClick={group.room || mode ? leave : home}
                >
                  <PhoneOff size={20} />
                </button>
              </div>
              <div className="call-bottom-panels">
                <button
                  className="m-icon"
                  title="Participants"
                  aria-label="Participants"
                  onClick={() => {
                    setTab("people");
                    setChatOpen(true);
                  }}
                >
                  <Users size={18} />
                </button>
                <button
                  className={`m-icon ${chatOpen ? "is-active" : ""}`}
                  title="Chat"
                  aria-label="Chat"
                  onClick={() => {
                    setTab("chat");
                    setChatOpen(!chatOpen);
                  }}
                >
                  <MessageSquare size={18} />
                  {group.messages.length > 0 && (
                    <span className="chat-count">{group.messages.length}</span>
                  )}
                </button>
              </div>
            </div>
            {settingsOpen && (
              <div className="call-details" role="status">
                <strong>
                  <ShieldCheck size={15} /> Meeting details
                </strong>
                <p>
                  {single
                    ? "Two-way voice, with up to two people."
                    : "Multi-way voice, with up to six people."}{" "}
                  Screen sharing uses your browser's screen picker. Public HTTPS
                  and TURN are required for restricted networks.
                </p>
                <button
                  className="m-icon"
                  title="Close details"
                  aria-label="Close details"
                  onClick={() => setSettingsOpen(false)}
                >
                  <X size={15} />
                </button>
              </div>
            )}
          </main>
          {chatOpen && (
            <>
              <button
                className="sidebar-scrim"
                aria-label="Close sidebar"
                onClick={() => setChatOpen(false)}
              />
              <ChatPanel
                group={group}
                tab={tab}
                setTab={setTab}
                onClose={() => setChatOpen(false)}
                isRecording={isRecording}
                startRecording={startRecording}
                stopRecording={stopRecording}
                recordingMessage={recordingMessage}
                savedRecording={savedRecording}
              />
            </>
          )}
        </div>
        <div className="remote-audio-elements">
          {group.members.map((member) => (
            <div key={member.id}>
              <MemberAudio
                stream={group.streams[member.id]}
                muted={speakersMuted}
                name={member.name}
              />
            </div>
          ))}
        </div>
      </div>
      {minimized && (
        <section className="minimized-call" aria-label="Minimized meeting">
          <button
            className="minimized-call-restore"
            onClick={onRestore}
            aria-label="Return to meeting"
          >
            <span className="minimized-call-avatar">
              {previewStream ? (
                <video
                  ref={minimizedVideoRef}
                  autoPlay
                  muted
                  playsInline
                  aria-label="Minimized screen preview"
                />
              ) : (
                <AudioLines size={25} />
              )}
            </span>
            <span className="minimized-call-copy">
              <strong>{single ? "Single meeting" : "Group meeting"}</strong>
              <small>
                <span className="tiny-dot" />
                {group.room
                  ? `${group.members.length + 1} in call`
                  : needsReconnect
                    ? "Reconnect needed"
                    : group.online
                      ? "Call ended"
                      : "Disconnected"}{" "}
                <span>/</span>{" "}
                {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
                {String(elapsed % 60).padStart(2, "0")}
              </small>
              <span>
                Return to call <ArrowRight size={12} />
              </span>
            </span>
          </button>
          <div className="minimized-call-controls">
            <button
              className="m-icon"
              disabled={!group.room || group.mediaBusy || group.self?.permissions?.microphone === false || group.self?.micLocked === true}
              onClick={group.toggleMic}
              aria-label={
                group.self?.micLocked
                  ? "Microphone locked by meeting owner"
                  : group.muted
                  ? "Unmute minimized microphone"
                  : "Mute minimized microphone"
              }
              title={group.self?.micLocked ? "The owner must allow unmuting" : group.muted ? "Unmute microphone" : "Mute microphone"}
            >
              {group.muted ? <MicOff size={17} /> : <Mic size={17} />}
            </button>
            <button
              className="m-icon minimized-call-end"
              onClick={() => {
                leave();
                onBack();
              }}
              aria-label="End minimized meeting"
              title="Leave meeting"
            >
              <PhoneOff size={18} />
            </button>
          </div>
        </section>
      )}
    </>
  );
}

function ArrowUpRightIcon() {
  return <ArrowRight size={20} className="entry-arrow" />;
}
