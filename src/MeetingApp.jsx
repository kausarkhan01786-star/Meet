import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Clock3,
  Facebook,
  Github,
  Instagram,
  Linkedin,
  LogIn,
  Plus,
  X,
} from "lucide-react";
import WorldScene from "./WorldScene";
import MeetingRoom from "./MeetingRoom";
import { SoundToggle } from "./MediaViews";
import { readMeetingSession, saveMeetingSession } from "./meetingSession.js";
import { installInteractionFeedback } from "./feedback.js";

function DigitalClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  const zone = new Intl.DateTimeFormat(undefined, {
    timeZoneName: "short",
  }).formatToParts(now).find((part) => part.type === "timeZoneName")?.value;
  return (
    <time className="hero-clock" dateTime={now.toISOString()} aria-label={`Local time ${time}`}>
      <Clock3 size={17} aria-hidden="true" />
      <span className="hero-clock-copy">
        <small>LOCAL TIME</small>
        <strong>{time}</strong>
      </span>
      {zone && <span className="hero-clock-zone">{zone}</span>}
    </time>
  );
}

export default function MeetingApp() {
  const [initialSession] = useState(readMeetingSession);
  const [view, setView] = useState(initialSession.view);
  const [minimized, setMinimized] = useState(
    initialSession.view !== "home" && initialSession.minimized,
  );
  const dialogRef = useRef(null);
  const [optionsOpen, setOptionsOpen] = useState(initialSession.pickerOpen);
  useEffect(() => installInteractionFeedback(), []);
  useEffect(() => {
    saveMeetingSession({ view, minimized, pickerOpen: optionsOpen });
  }, [view, minimized, optionsOpen]);
  useEffect(() => {
    if (optionsOpen && dialogRef.current && !dialogRef.current.open)
      dialogRef.current.showModal();
  }, [optionsOpen, view, minimized]);
  function closeOptions() {
    dialogRef.current?.close();
    setOptionsOpen(false);
  }
  function choose(mode) {
    closeOptions();
    saveMeetingSession({
      view: "group",
      minimized: false,
      mode,
      code: "",
      roomCode: "",
    });
    setView("group");
    setMinimized(false);
  }
  return (
    <>
      {view !== "home" && (
        <MeetingRoom
          key={view}
          meetingType={view}
          initialSession={readMeetingSession()}
          minimized={minimized}
          onMinimize={() => setMinimized(true)}
          onRestore={() => setMinimized(false)}
          onBack={() => {
            saveMeetingSession({
              view: "home",
              minimized: false,
              mode: null,
              code: "",
              roomCode: "",
            });
            setView("home");
            setMinimized(false);
          }}
        />
      )}
      {(view === "home" || minimized) && (
        <main
          className={`meeting-home ${minimized ? "has-minimized-call" : ""}`}
        >
          <WorldScene softened={optionsOpen} />
          <SoundToggle className="hero-sound-toggle" />
          <div className="hero-brand">
            <AudioLines size={23} strokeWidth={1.7} />
            <span>
              Meeting<span className="brand-stop">.</span>
            </span>
          </div>
          <section className={`hero-copy ${optionsOpen ? "is-dimmed" : ""}`}>
            <div className="hero-eyebrow">
              <span /> NO DISTANCE BETWEEN US
            </div>
            <h1>
              Meeting<span>.</span>
            </h1>
            <p>
              A world apart.
              <br />
              One conversation away.
            </p>
            <div className="hero-action-row">
              <button
                className="add-meeting-button"
                onClick={() => {
                  if (minimized) {
                    setMinimized(false);
                    return;
                  }
                  setOptionsOpen(true);
                  dialogRef.current.showModal();
                }}
              >
                <span className="button-plus">
                  <Plus size={19} />
                </span>
                <span>
                  {minimized ? "Return to Meeting" : "Create a meeting"}
                </span>
                <ArrowUpRight size={20} />
                <span className="button-shimmer" aria-hidden="true" />
              </button>
              <DigitalClock />
            </div>
          </section>
          <footer className="creator-credit">
            <span>&copy; {new Date().getFullYear()} Meeting.</span>
            <span>
              Created by{" "}
              <a
                className="creator-name-link"
                href="https://kausarmia.web.app/"
                target="_blank"
                rel="noopener noreferrer"
                title="Kausar mia's portfolio"
              >
                <strong>Kausar mia</strong>
                <ArrowUpRight size={12} />
              </a>
            </span>
            <nav
              className="creator-socials"
              aria-label="Kausar mia's social links"
            >
              <a
                href="https://github.com/kausar017"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Kausar mia on GitHub"
                title="Kausar mia on GitHub"
              >
                <Github size={15} />
              </a>
              <a
                href="https://www.facebook.com/kausar017"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Kausar mia on Facebook"
                title="Kausar mia on Facebook"
              >
                <Facebook size={15} />
              </a>
              <a
                href="https://www.instagram.com/md.kousar_mia/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Kausar mia on Instagram"
                title="Kausar mia on Instagram"
              >
                <Instagram size={15} />
              </a>
              <a
                href="https://www.linkedin.com/in/kausar-mia-developer/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Kausar mia on LinkedIn"
                title="Kausar mia on LinkedIn"
              >
                <Linkedin size={15} />
              </a>
            </nav>
          </footer>
          <dialog
            className="meeting-picker"
            ref={dialogRef}
            onCancel={() => setOptionsOpen(false)}
            onClick={(event) => {
              if (event.target === dialogRef.current) closeOptions();
            }}
          >
            <div className="picker-top">
              <span>
                <AudioLines size={17} /> YOUR NEXT CONVERSATION
              </span>
              <button
                className="m-icon"
                aria-label="Close meeting options"
                title="Close"
                onClick={closeOptions}
              >
                <X size={20} />
              </button>
            </div>
            <h2>Create or join a meeting</h2>
            <p>Choose how you would like to get started.</p>
            <div className="meeting-choice-grid">
              <button
                className="meeting-choice create-choice"
                onClick={() => choose("create")}
              >
                <span className="choice-number">01 / START SOMETHING NEW</span>
                <div className="choice-art" aria-hidden="true">
                  <Plus size={67} strokeWidth={1} />
                </div>
                <span className="choice-title">
                  Create new meeting <ArrowUpRight size={24} />
                </span>
                <span className="choice-description">
                  Open a meeting and invite others with a code.
                </span>
                <span className="choice-action">
                  Create your meeting <ArrowRight size={17} />
                </span>
              </button>
              <button
                className="meeting-choice join-choice"
                onClick={() => choose("join")}
              >
                <span className="choice-number">02 / MEET YOUR PEOPLE</span>
                <div className="choice-art" aria-hidden="true">
                  <LogIn size={67} strokeWidth={1} />
                </div>
                <span className="choice-title">
                  Join meeting <ArrowUpRight size={24} />
                </span>
                <span className="choice-description">
                  Enter the six-digit code you received.
                </span>
                <span className="choice-action">
                  Join with a code <ArrowRight size={17} />
                </span>
              </button>
            </div>
            <button className="picker-back" onClick={closeOptions}>
              <ArrowLeft size={14} /> Back to the world
            </button>
          </dialog>
        </main>
      )}
    </>
  );
}
