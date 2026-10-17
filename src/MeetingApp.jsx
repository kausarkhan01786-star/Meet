import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, AudioLines, Plus, Users, UserRound, X } from "lucide-react";
import WorldScene from "./WorldScene";
import MeetingRoom from "./MeetingRoom";

export default function MeetingApp() {
  const [view, setView] = useState("home");
  const dialogRef = useRef(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  function closeOptions() { dialogRef.current?.close(); setOptionsOpen(false); }
  function choose(type) { closeOptions(); setView(type); }
  if (view !== "home") return <MeetingRoom key={view} meetingType={view} onBack={() => setView("home")} />;
  return <main className="meeting-home">
    <WorldScene softened={optionsOpen} />
    <div className="hero-brand"><AudioLines size={23} strokeWidth={1.7} /><span>Meeting<span className="brand-stop">.</span></span></div>
    <section className={`hero-copy ${optionsOpen ? "is-dimmed" : ""}`}>
      <div className="hero-eyebrow"><span /> NO DISTANCE BETWEEN US</div>
      <h1>Meeting<span>.</span></h1>
      <p>A world apart.<br />One conversation away.</p>
      <button className="add-meeting-button" onClick={() => { setOptionsOpen(true); dialogRef.current.showModal(); }}><span className="button-plus"><Plus size={19} /></span><span>Add Meeting</span><ArrowUpRight size={20} /><span className="button-shimmer" aria-hidden="true" /></button>
    </section>
    <dialog className="meeting-picker" ref={dialogRef} onCancel={() => setOptionsOpen(false)} onClick={(event) => { if (event.target === dialogRef.current) closeOptions(); }}>
      <div className="picker-top"><span><AudioLines size={17} /> MAKE A LITTLE ROOM</span><button className="m-icon" aria-label="Close meeting options" title="Close" onClick={closeOptions}><X size={20} /></button></div>
      <h2>How are we meeting?</h2><p>One good conversation starts here.</p>
      <div className="meeting-choice-grid"><button className="meeting-choice single-choice" onClick={() => choose("single")}><span className="choice-number">01 / JUST THE TWO OF YOU</span><div className="choice-art two-people" aria-hidden="true"><span><UserRound size={37} strokeWidth={1.1} /></span><i /><span><UserRound size={37} strokeWidth={1.1} /></span></div><span className="choice-title">Single meeting <ArrowUpRight size={24} /></span><span className="choice-description">A conversation, without the crowd.</span><span className="choice-action">Create or receive a call <ArrowRight size={17} /></span></button><button className="meeting-choice group-choice" onClick={() => choose("group")}><span className="choice-number">02 / BRING YOUR PEOPLE</span><div className="choice-art group-people" aria-hidden="true"><Users size={83} strokeWidth={0.8} /><span className="choice-small-plus"><Plus size={19} /></span></div><span className="choice-title">Group meeting <ArrowUpRight size={24} /></span><span className="choice-description">Different places. One shared space.</span><span className="choice-action">Create or join a group <ArrowRight size={17} /></span></button></div>
      <button className="picker-back" onClick={closeOptions}><ArrowLeft size={14} /> Back to the world</button>
    </dialog>
  </main>;
}