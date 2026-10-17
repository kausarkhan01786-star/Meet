import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  Copy,
  Headphones,
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
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useGroup } from "./useGroup";
import { MemberAudio, SharedScreen } from "./GroupRoom";

function ChatPanel({ group, tab, setTab, onClose }) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef(null);
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
            <MessageSquare size={16} /> Chat
          </button>
          <button
            role="tab"
            aria-selected={tab === "people"}
            onClick={() => setTab("people")}
          >
            <Users size={16} /> People{" "}
            <span>{group.room ? group.members.length + 1 : 0}</span>
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
                <p>{message.text}</p>
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
              disabled={!group.room || !group.online}
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
            <div>
              <span>
                <LockKeyhole size={11} /> Only in this meeting
              </span>
              <button
                type="submit"
                aria-label="Send message"
                title="Send message"
                disabled={!group.room || !group.online || !draft.trim()}
              >
                <Send size={15} />
              </button>
            </div>
          </form>
        </>
      ) : (
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
                  <strong>You</strong>
                  <small>
                    {group.muted ? "Microphone off" : "Microphone on"}
                  </small>
                </div>
                {group.muted ? <MicOff size={15} /> : <Mic size={15} />}
              </div>
              {group.members.map((member) => (
                <div className="person-row" key={member.id}>
                  <span className="person-avatar">
                    {member.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <strong>{member.name}</strong>
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
                  {member.muted ? <MicOff size={15} /> : <Mic size={15} />}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </aside>
  );
}

export default function MeetingRoom({ meetingType = "group", onBack }) {
  const group = useGroup({ meetingType });
  const single = meetingType === "single";
  const [mode, setMode] = useState(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [speakersMuted, setSpeakersMuted] = useState(false);
  const [chatOpen, setChatOpen] = useState(() => window.innerWidth > 1050);
  const [tab, setTab] = useState("chat");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const attemptedCode = useRef("");
  const creating = useRef(false);
  const copyTimer = useRef(null);
  const joinedAt = useRef(0);
  useEffect(() => {
    if (mode === "create" && group.online && !group.room && !creating.current) {
      creating.current = true;
      group.enter("create", name.trim() || "Host", "");
    }
    if (
      mode === "join" &&
      group.online &&
      code.length === 6 &&
      !group.room &&
      !group.joining &&
      attemptedCode.current !== code
    ) {
      attemptedCode.current = code;
      group.enter("join", name.trim() || "Guest", code);
    }
  }, [mode, code, group.online, group.room, group.joining, name]);
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
  }, [group.room]);
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
    setMode(null);
    setCode("");
    creating.current = false;
    attemptedCode.current = "";
  }
  function home() {
    group.leave();
    onBack();
  }
  const screenMembers = group.members.filter((member) => member.sharing);
  const screenCount = screenMembers.length + Number(group.sharing);
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
    <div className={`meeting-workspace ${chatOpen ? "has-sidebar" : ""}`}>
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
            if (mode || group.room) leave();
            else home();
          }}
        >
          <span className={`tiny-dot ${group.online ? "" : "is-offline"}`} />
          {single ? "Single meeting" : "Group meeting"}
          <ChevronDown size={13} />
        </button>
        <div className="header-end">
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
          <div className="room-topline">
            <button className="workspace-back" onClick={mode ? leave : home}>
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
            {group.room && (
              <div className="room-code-box">
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
            )}
          </section>
          {!mode ? (
            <section className="meeting-entry">
              <label className="entry-name-label" htmlFor="display-name">
                YOUR NAME <span>OPTIONAL</span>
              </label>
              <input
                className="meeting-name-input"
                id="display-name"
                placeholder="What should we call you?"
                maxLength={40}
                autoComplete="nickname"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <div className="entry-choice-grid">
                <button
                  className="entry-choice"
                  onClick={() => {
                    creating.current = false;
                    setMode("create");
                  }}
                >
                  <span className="entry-choice-icon">
                    <Plus size={25} strokeWidth={1.3} />
                  </span>
                  <strong>
                    {single ? "Create call" : "Create group"}
                    <ArrowUpRightIcon />
                  </strong>
                  <small>
                    {single
                      ? "Make a little space for someone."
                      : "One code. Everyone you want here."}
                  </small>
                  <span className="entry-choice-bottom">
                    {single ? "Start your conversation" : "Start your group"}
                    <ArrowRight size={17} />
                  </span>
                </button>
                <button
                  className="entry-choice receive-entry"
                  onClick={() => setMode("join")}
                >
                  <span className="entry-choice-icon">
                    <LogIn size={25} strokeWidth={1.3} />
                  </span>
                  <strong>
                    {single ? "Receive call" : "Add group"}
                    <ArrowUpRightIcon />
                  </strong>
                  <small>
                    {single
                      ? "Someone is waiting on the other side."
                      : "Your people have a place for you."}
                  </small>
                  <span className="entry-choice-bottom">
                    {single ? "Enter a pairing code" : "Join with a group code"}
                    <ArrowRight size={17} />
                  </span>
                </button>
              </div>
            </section>
          ) : !group.room ? (
            <div className="meeting-join-stage">
              {mode === "join" ? (
                <form
                  className="receive-call-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    group.enter("join", name.trim() || "Guest", code);
                  }}
                >
                  <div className="receive-call-symbol">
                    <Phone size={31} strokeWidth={1.2} />
                  </div>
                  <h2>
                    {single
                      ? "You're six digits away."
                      : "Your group is six digits away."}
                  </h2>
                  <label htmlFor="meeting-code">
                    {single ? "PAIRING CODE" : "GROUP CODE"}
                  </label>
                  <input
                    autoFocus
                    id="meeting-code"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    placeholder="000000"
                    value={code}
                    disabled={group.joining}
                    required
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                  />
                  <button
                    className="connect-call-button"
                    disabled={
                      !group.online || group.joining || code.length !== 6
                    }
                  >
                    {group.joining ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <ArrowRight size={16} />
                    )}
                    {group.joining ? "Connecting..." : "Connect"}
                  </button>
                  <span className="join-secure">
                    <LockKeyhole size={12} /> The code stays between your
                    people.
                  </span>
                </form>
              ) : (
                <div className="room-preparing">
                  <AudioLines size={45} strokeWidth={1} />
                  <h2>
                    {group.joining
                      ? "Finding a little room..."
                      : group.error
                        ? "Let's try that again."
                        : "Preparing your room..."}
                  </h2>
                  {!group.joining && (
                    <button
                      className="connect-call-button"
                      disabled={!group.online}
                      onClick={() =>
                        group.enter("create", name.trim() || "Host", "")
                      }
                    >
                      <Plus size={15} /> Create {single ? "call" : "group"}
                    </button>
                  )}
                </div>
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
                    <SharedScreen stream={group.localScreen} name="You" local />
                  )}
                  {screenMembers.map((member) => (
                    <SharedScreen
                      key={member.id}
                      stream={group.streams[member.id]}
                      name={member.name}
                    />
                  ))}
                </div>
              ) : (
                <div className="voice-room">
                  <div className="voice-room-top">
                    <span className="voice-live">
                      <AudioLines size={13} />{" "}
                      {connectedCount ? "VOICE CONNECTED" : "YOUR ROOM IS OPEN"}
                    </span>
                    <span>
                      {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
                      {String(elapsed % 60).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="voice-members">
                    <div
                      className={`voice-person ${group.muted ? "is-muted" : ""}`}
                    >
                      <div className="voice-avatar">
                        <span>
                          {(
                            name.trim() ||
                            (mode === "create" ? "Host" : "Guest")
                          )
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                        <i />
                        <i />
                        <i />
                      </div>
                      <strong>
                        You{" "}
                        <span>
                          {group.muted ? (
                            <MicOff size={12} />
                          ) : (
                            <Mic size={12} />
                          )}
                        </span>
                      </strong>
                      <small>
                        {group.muted ? "Microphone off" : "Microphone on"}
                      </small>
                    </div>
                    {group.members.map((member, index) => (
                      <div
                        className={`voice-person tone-${index % 3} ${member.muted ? "is-muted" : ""}`}
                        key={member.id}
                      >
                        <div className="voice-avatar">
                          <span>{member.name.slice(0, 2).toUpperCase()}</span>
                          <i />
                          <i />
                          <i />
                        </div>
                        <strong>
                          {member.name}
                          {member.muted && <MicOff size={12} />}
                        </strong>
                        <small>
                          {group.connections[member.id] === "connected"
                            ? "Connected"
                            : "Connecting..."}
                        </small>
                      </div>
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
              <button
                className={`call-control ${group.muted ? "control-off" : ""}`}
                aria-label={
                  group.muted ? "Unmute microphone" : "Mute microphone"
                }
                title={group.muted ? "Unmute microphone" : "Mute microphone"}
                disabled={!group.room || group.mediaBusy}
                onClick={group.toggleMic}
              >
                {group.muted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              <button
                className={`call-control ${speakersMuted ? "control-off" : ""}`}
                title={speakersMuted ? "Unmute speakers" : "Mute speakers"}
                aria-label={speakersMuted ? "Unmute speakers" : "Mute speakers"}
                onClick={() => setSpeakersMuted(!speakersMuted)}
              >
                {speakersMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
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
  );
}

function ArrowUpRightIcon() {
  return <ArrowRight size={20} className="entry-arrow" />;
}
