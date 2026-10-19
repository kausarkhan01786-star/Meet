import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BarChart3,
  Check,
  ChevronDown,
  Circle,
  Copy,
  Download,
  FileSpreadsheet,
  Gauge,
  GraduationCap,
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

async function downloadStudentSheet(students, meetingCode) {
  const pageWidth = 1190;
  const pageHeight = 1684;
  const padding = 88;
  const rowHeight = 62;
  const tableTop = 270;
  const rowsPerPage = Math.floor((pageHeight - tableTop - 110) / rowHeight);
  const columnWidths = [300, 160, 160, pageWidth - padding * 2 - 620];
  const headings = ["Name", "Roll", "Section", "Department"];
  const chunks = [];
  const wrapCell = (context, value, maxWidth) => {
    const words = String(value ?? "").split(/\s+/);
    const lines = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth) line = candidate;
      else if (!line) {
        let clipped = word;
        while (clipped.length > 1 && context.measureText(`${clipped}…`).width > maxWidth) clipped = clipped.slice(0, -1);
        line = `${clipped}${clipped === word ? "" : "…"}`;
      } else {
        lines.push(line);
        line = word;
      }
      if (lines.length === 2) break;
    }
    if (line && lines.length < 2) lines.push(line);
    if (lines.length === 2 && words.join(" ").length > lines.join(" ").length) {
      while (lines[1].length > 1 && context.measureText(`${lines[1]}…`).width > maxWidth) lines[1] = lines[1].slice(0, -1);
      lines[1] = `${lines[1]}…`;
    }
    return lines;
  };
  const canvasBlob = (canvas) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not render a PDF page.")), "image/jpeg", 0.92);
  });

  for (let offset = 0; offset < students.length; offset += rowsPerPage) {
    const canvas = document.createElement("canvas");
    canvas.width = pageWidth;
    canvas.height = pageHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot create a PDF.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, pageWidth, pageHeight);
    context.fillStyle = "#211a29";
    context.fillRect(0, 0, pageWidth, 18);
    context.fillStyle = "#241b30";
    context.font = "bold 42px Arial, sans-serif";
    context.fillText(offset ? "Student List (continued)" : "Student List", padding, 108);
    context.fillStyle = "#685c70";
    context.font = "22px Arial, sans-serif";
    context.fillText(`Meeting ${meetingCode || ""}  •  ${students.length} students`, padding, 154);

    let y = tableTop;
    context.fillStyle = "#33253d";
    context.fillRect(padding, y, pageWidth - padding * 2, 58);
    context.font = 'bold 21px Arial, "Nirmala UI", sans-serif';
    context.fillStyle = "#ffffff";
    let x = padding;
    headings.forEach((heading, index) => {
      context.fillText(heading, x + 14, y + 36);
      x += columnWidths[index];
    });
    y += 58;
    const pageStudents = students.slice(offset, offset + rowsPerPage);
    pageStudents.forEach((student, rowIndex) => {
      context.fillStyle = rowIndex % 2 ? "#f5f2f7" : "#ffffff";
      context.fillRect(padding, y, pageWidth - padding * 2, rowHeight);
      context.strokeStyle = "#e5dfea";
      context.beginPath();
      context.moveTo(padding, y + rowHeight);
      context.lineTo(pageWidth - padding, y + rowHeight);
      context.stroke();
      context.font = '20px Arial, "Nirmala UI", sans-serif';
      context.fillStyle = "#241d29";
      let cellX = padding;
      [student.name, student.roll, student.section, student.department].forEach((value, columnIndex) => {
        const lines = wrapCell(context, value, columnWidths[columnIndex] - 24);
        lines.forEach((line, lineIndex) => context.fillText(line, cellX + 14, y + 27 + lineIndex * 24));
        cellX += columnWidths[columnIndex];
      });
      y += rowHeight;
    });
    context.fillStyle = "#786d80";
    context.font = "18px Arial, sans-serif";
    context.fillText(`Page ${chunks.length + 1}`, padding, pageHeight - 54);
    chunks.push(new Uint8Array(await (await canvasBlob(canvas)).arrayBuffer()));
  }

  const encoder = new TextEncoder();
  const ascii = (text) => encoder.encode(text);
  const objects = [null, ascii("<< /Type /Catalog /Pages 2 0 R >>")];
  const pageIds = chunks.map((_, index) => 3 + index * 3);
  objects[2] = ascii(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  chunks.forEach((jpeg, index) => {
    const pageId = pageIds[index];
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    const content = ascii(`q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ\n`);
    objects[pageId] = ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects[imageId] = [ascii(`<< /Type /XObject /Subtype /Image /Width ${pageWidth} /Height ${pageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, ascii("\nendstream")];
    objects[contentId] = ascii(`<< /Length ${content.length} >>\nstream\n${new TextDecoder().decode(content)}endstream`);
  });

  const parts = [ascii("%PDF-1.4\n")];
  const offsets = [0];
  let byteLength = parts[0].length;
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = byteLength;
    const body = Array.isArray(objects[id]) ? objects[id] : [objects[id]];
    const objectParts = [ascii(`${id} 0 obj\n`), ...body, ascii("\nendobj\n")];
    parts.push(...objectParts);
    byteLength += objectParts.reduce((total, part) => total + part.length, 0);
  }
  const xrefOffset = byteLength;
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  parts.push(ascii(`${xref}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
  const pdf = new Blob(parts, { type: "application/pdf" });
  const url = URL.createObjectURL(pdf);
  const link = document.createElement("a");
  link.href = url;
  link.download = `meeting-${meetingCode || "students"}-students.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function encodeProfileImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("Could not open that image."));
    image.src = source;
  });
  for (const maxDimension of [256, 192, 144, 112]) {
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not process that image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.68, 0.55]) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= 8_000) {
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("Could not process that image."));
          reader.readAsDataURL(blob);
        });
      }
    }
  }
  throw new Error("Could not shrink that image enough. Try a different picture.");
}

function ProfileImagePicker({ profileImage, name, onSelect, onRemove, disabled, error }) {
  return (
    <div className="profile-image-picker">
      <span className="profile-image-label">PROFILE IMAGE <small>OPTIONAL</small></span>
      <div className="profile-image-actions">
        <span className="profile-image-preview">{profileImage ? <img src={profileImage} alt="Profile preview" /> : name.trim().slice(0, 2).toUpperCase() || <Users size={18} />}</span>
        <label className={`profile-image-upload ${disabled ? "is-disabled" : ""}`}>{profileImage ? "Change image" : "Upload image"}<input type="file" accept="image/*" disabled={disabled} onChange={onSelect} /></label>
        {profileImage && <button type="button" className="profile-image-remove" disabled={disabled} onClick={onRemove}>Remove</button>}
      </div>
      <small className="profile-image-help">Optional. Meeting participants can see it; image is resized before sharing.</small>
      {error && <small className="profile-image-error" role="alert">{error}</small>}
    </div>
  );
}

function ChatPanel({ group, tab, setTab, onClose, isRecording, startRecording, stopRecording, recordingMessage, savedRecording }) {
  const [draft, setDraft] = useState("");
  const [studentFormOpen, setStudentFormOpen] = useState(false);
  const [studentDetails, setStudentDetails] = useState({ name: "", roll: "", section: "", department: "" });
  const [studentFeedback, setStudentFeedback] = useState("");
  const [pollFormOpen, setPollFormOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollFeedback, setPollFeedback] = useState("");
  const chatDisabled = group.room?.chatEnabled === false;
  const cannotSend = !group.room || !group.online || chatDisabled;
  const everyoneMicLocked = Boolean(group.room?.muteAllLocked || group.self?.micLocked || group.members.some((member) => member.micLocked));
  const bottomRef = useRef(null);
  useEffect(() => {
    setDraft("");
    setStudentFormOpen(false);
    setStudentDetails({ name: "", roll: "", section: "", department: "" });
    setStudentFeedback("");
    setPollFormOpen(false);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setPollFeedback("");
  }, [group.room?.selfId]);
  useEffect(() => {
    if (group.studentSubmission) setStudentFeedback(group.studentSubmission);
  }, [group.studentSubmission]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [group.messages.length, group.polls.length]);
  function submit(event) {
    event.preventDefault();
    if (group.sendMessage(draft)) setDraft("");
  }
  function submitStudentDetails() {
    if (Object.values(studentDetails).some((value) => !value.trim())) {
      setStudentFeedback("Please complete all four fields.");
      return;
    }
    if (group.submitStudentDetails(studentDetails)) setStudentFeedback("Sending your details...");
    else setStudentFeedback("Could not send your details. Check your meeting connection.");
  }
  function submitPoll() {
    const options = pollOptions.map((option) => option.trim());
    if (!pollQuestion.trim() || options.length < 2 || options.some((option) => !option)) {
      setPollFeedback("Add a question and at least two options.");
      return;
    }
    if (group.createPoll(pollQuestion.trim(), options)) {
      setPollFormOpen(false);
      setPollQuestion("");
      setPollOptions(["", ""]);
      setPollFeedback("");
    } else setPollFeedback("Could not create the poll. Check your meeting connection.");
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
            {!group.messages.length && !group.polls.length && (
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
            {group.polls.map((poll) => {
              const voteTotal = poll.options.reduce((sum, option) => sum + option.votes, 0);
              return <article className="meeting-poll-card" key={poll.id}>
                <div className="meeting-poll-heading"><BarChart3 size={15} /><strong>{poll.question}</strong></div>
                <small>Poll by {poll.creatorName}</small>
                <div className="meeting-poll-options">{poll.options.map((option) => {
                  const percentage = voteTotal ? Math.round(option.votes / voteTotal * 100) : 0;
                  const selected = poll.myVote === option.id;
                  return <button type="button" key={option.id} className={`meeting-poll-option ${selected ? "is-selected" : ""}`} aria-pressed={selected} onClick={() => group.votePoll(poll.id, option.id)}>
                    <span className="meeting-poll-option-bar" style={{ width: `${percentage}%` }} />
                    <span className="meeting-poll-option-label">{option.label}</span>
                    <span className="meeting-poll-option-count">{option.votes}{voteTotal ? ` · ${percentage}%` : ""}</span>
                  </button>;
                })}</div>
                <small>{voteTotal} vote{voteTotal === 1 ? "" : "s"}{poll.myVote ? " · You can change your vote" : " · Select an option to vote"}</small>
              </article>;
            })}
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
            {studentFormOpen && (
              <div className="student-registration-form" aria-label="Student information">
                <div className="student-form-heading"><strong>Student information</strong><button type="button" className="m-icon" aria-label="Close student form" title="Close student form" onClick={() => setStudentFormOpen(false)}><X size={14} /></button></div>
                <p>Owner/Admin can view and download these details for this meeting. They are cleared when the meeting ends.</p>
                <div className="student-form-fields">
                  {[['name', 'Name'], ['roll', 'Roll'], ['section', 'Section'], ['department', 'Department']].map(([field, label]) => <label key={field}>{label}<input disabled={group.studentSubmitted || group.studentSubmission === "Sending your details..."} maxLength={field === "department" || field === "name" ? 100 : 50} value={studentDetails[field]} onChange={(event) => setStudentDetails((current) => ({ ...current, [field]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submitStudentDetails(); } }} /></label>)}
                </div>
                <button type="button" className="student-submit-button" disabled={!group.room || !group.online || group.studentSubmitted || group.studentSubmission === "Sending your details..."} onClick={submitStudentDetails}>{group.studentSubmitted ? "Already submitted" : "Submit details"}</button>
                {studentFeedback && <small className="student-feedback" role="status">{studentFeedback}</small>}
              </div>
            )}
            {pollFormOpen && <div className="poll-create-form" role="group" aria-label="Create poll">
              <div className="student-form-heading"><strong>Create a poll</strong><button type="button" className="m-icon" aria-label="Close poll form" title="Close poll form" onClick={() => setPollFormOpen(false)}><X size={14} /></button></div>
              <label>Question<input maxLength={160} value={pollQuestion} onChange={(event) => setPollQuestion(event.target.value)} placeholder="Ask a question" /></label>
              <div className="poll-create-options">{pollOptions.map((option, index) => <label key={index}>Option {index + 1}<span><input maxLength={80} value={option} onChange={(event) => setPollOptions((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={`Choice ${index + 1}`} />{pollOptions.length > 2 && <button type="button" className="m-icon" aria-label={`Remove option ${index + 1}`} onClick={() => setPollOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={13} /></button>}</span></label>)}</div>
              <div className="poll-create-actions"><button type="button" className="poll-add-option" disabled={pollOptions.length >= 6} onClick={() => setPollOptions((current) => [...current, ""])}>Add option</button><button type="button" className="student-submit-button" disabled={cannotSend} onClick={submitPoll}>Create poll</button></div>
              {pollFeedback && <small className="student-feedback" role="status">{pollFeedback}</small>}
            </div>}
            <ChatAttachments disabled={cannotSend} studentDisabled={!group.room || !group.online} onStudentClick={() => { setStudentFeedback(""); setPollFormOpen(false); setStudentFormOpen((open) => !open); }} onPollClick={group.isAdmin ? () => { setStudentFormOpen(false); setPollFeedback(""); setPollFormOpen((open) => !open); } : undefined} pollDisabled={!group.room || !group.online} onEmoji={(emoji) => setDraft((current) => (current + emoji).slice(0, 2000))} onSendFile={group.sendFile} />
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
              <section className="speaking-queue-section" aria-label="Fair speaking queue" aria-live="polite">
                <div className="speaking-queue-heading"><div><strong>Fair speaking queue</strong><small>First hand raised, first in line</small></div><Hand size={15} /></div>
                {group.currentSpeaker && <div className="speaking-current"><span><small>Speaking now</small><strong>{group.currentSpeaker.id === group.room?.selfId ? "You" : group.currentSpeaker.name}</strong></span>{(group.currentSpeaker.id === group.room?.selfId || group.isAdmin) && <button type="button" onClick={group.finishSpeakingTurn}>{group.currentSpeaker.id === group.room?.selfId ? "Finish my turn" : "End turn"}</button>}</div>}
                {group.speakingQueue.length ? <ol className="speaking-queue-list">{group.speakingQueue.map((speaker, index) => <li key={speaker.id}><span className="speaking-queue-position">{index + 1}</span><span>{speaker.id === group.room?.selfId ? "You" : speaker.name}</span>{index === 0 && <small>Next</small>}</li>)}</ol> : <p className="speaking-queue-empty">No one is waiting. Raise your hand to join the queue.</p>}
                {group.isAdmin && <button type="button" className="speaking-queue-next" disabled={!group.speakingQueue.length} onClick={group.advanceSpeakingQueue}><ArrowRight size={13} /> Invite next speaker</button>}
              </section>
              <div className="person-row">
                <span className="person-avatar">{group.self?.profileImage ? <img src={group.self.profileImage} alt="" /> : "YOU"}</span>
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
                    {member.profileImage ? <img src={member.profileImage} alt="" /> : member.name.slice(0, 2).toUpperCase()}
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
          {group.isAdmin && (
            <section className="student-sheet-section">
              <div className="student-sheet-heading"><div><h3>Student list</h3><small>{group.students.length} student{group.students.length === 1 ? "" : "s"} submitted</small></div><button className="recording-download" type="button" disabled={!group.students.length} onClick={() => downloadStudentSheet(group.students, group.room?.code)}><FileSpreadsheet size={14} /> Download PDF</button></div>
              {group.students.length ? <div className="student-sheet-wrap"><table className="student-sheet"><thead><tr><th>Name</th><th>Roll</th><th>Section</th><th>Department</th></tr></thead><tbody>{group.students.map((student) => <tr key={student.id}><td>{student.name}</td><td>{student.roll}</td><td>{student.section}</td><td>{student.department}</td></tr>)}</tbody></table></div> : <p className="student-sheet-empty">No student details submitted yet.</p>}
            </section>
          )}
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

function speakRecordingAnnouncement(name) {
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
  const synth = window.speechSynthesis;
  const utterance = new window.SpeechSynthesisUtterance(`${name} is recording the meeting`);
  const voices = synth.getVoices();
  const englishVoices = voices.filter((voice) => voice.lang?.toLowerCase().startsWith("en"));
  const maleVoiceName = /\b(andrew|brian|christopher|davis|david|eric|guy|jason|liam|mark|oliver|ravi|richard|roger|ryan|tony)\b/i;
  const naturalMaleVoice = englishVoices.find((voice) =>
    /natural|online|neural/i.test(voice.name) && maleVoiceName.test(voice.name),
  );
  const likelyMaleVoice = englishVoices.find((voice) => maleVoiceName.test(voice.name));
  const selectedVoice = naturalMaleVoice || likelyMaleVoice || englishVoices[0];
  if (selectedVoice) {
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang;
  } else {
    utterance.lang = "en-US";
  }
  utterance.rate = 0.98;
  utterance.pitch = 1;
  utterance.volume = 1;
  synth.speak(utterance);
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
  const [profileImage, setProfileImage] = useState("");
  const [profileImageError, setProfileImageError] = useState("");
  const [profileImageBusy, setProfileImageBusy] = useState(false);
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
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [tab, setTab] = useState(initialSession.tab || "chat");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMessage, setRecordingMessage] = useState("");
  const [savedRecording, setSavedRecording] = useState(null);
  const announcedRecordingId = useRef(null);
  const attemptedCode = useRef("");
  const creating = useRef(false);
  const copyTimer = useRef(null);
  const seenMessageIds = useRef(new Set());
  const messageRoomId = useRef(null);
  const joinedAt = useRef(0);
  const minimizedVideoRef = useRef(null);
  const recorderSessionRef = useRef(null);
  const recordingUrlRef = useRef(null);
  const savedRoomCode = useRef(initialSession.roomCode || "");
  useEffect(() => {
    const announcement = group.recordingAnnouncement;
    if (!announcement?.id || announcedRecordingId.current === announcement.id) return;
    announcedRecordingId.current = announcement.id;
    setRecordingMessage(`${announcement.name} is recording the meeting.`);
    speakRecordingAnnouncement(announcement.name || "A participant");
  }, [group.recordingAnnouncement]);
  async function selectProfileImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setProfileImageError("");
    setProfileImageBusy(true);
    try {
      setProfileImage(await encodeProfileImage(file));
    } catch (failure) {
      setProfileImageError(failure.message || "Could not process that image.");
    } finally {
      setProfileImageBusy(false);
    }
  }
  function removeProfileImage() {
    setProfileImage("");
    setProfileImageError("");
  }
  useEffect(() => {
    const currentRoomId = group.room?.selfId || null;
    const currentIds = new Set(group.messages.map((message) => message.id));

    if (messageRoomId.current !== currentRoomId) {
      messageRoomId.current = currentRoomId;
      seenMessageIds.current = currentIds;
      setUnreadMessageCount(0);
      return;
    }

    const newIncomingCount = group.messages.filter(
      (message) =>
        !seenMessageIds.current.has(message.id) &&
        message.senderId !== currentRoomId,
    ).length;
    seenMessageIds.current = currentIds;

    if (chatOpen && tab === "chat") setUnreadMessageCount(0);
    else if (newIncomingCount > 0)
      setUnreadMessageCount((count) => count + newIncomingCount);
  }, [group.messages, group.room?.selfId, chatOpen, tab]);
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
    if (!autoEnter || needsReconnect || profileImageBusy) return;
    if (
      mode === "create" &&
      name.trim() &&
      group.online &&
      !group.room &&
      !creating.current
    ) {
      creating.current = true;
      group.enter("create", name.trim(), "", profileImage);
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
      group.enter("join", name.trim(), code, profileImage);
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
    profileImage,
    profileImageBusy,
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
  const cameraTiles = (
    <>
      <CameraTile
        stream={group.localCamera}
        audioStream={group.localAudio}
        name={name.trim() || (mode === "create" ? "Host" : "Guest")}
        profileImage={group.self?.profileImage || profileImage}
        local
        enabled={group.cameraOn}
        muted={group.muted}
        handRaised={group.self?.handRaised}
      />
      {group.members.map((member) => (
        <CameraTile
          key={member.id}
          stream={group.cameraStreams[member.id]}
          audioStream={group.streams[member.id]}
          name={member.name}
          profileImage={member.profileImage}
          enabled={member.camera}
          muted={member.muted}
          handRaised={member.handRaised}
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
                            ? group.joining ? "Preparing your private room..." : "Add an optional profile image, then create your private room."
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
                <ProfileImagePicker profileImage={profileImage} name={name} disabled={profileImageBusy} error={profileImageBusy ? "Processing image..." : profileImageError} onSelect={selectProfileImage} onRemove={removeProfileImage} />
                <div className="entry-choice-grid">
                  <button
                    className="entry-choice"
                    disabled={!name.trim() || profileImageBusy}
                    onClick={() => {
                      creating.current = false;
                      setAutoEnter(false);
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
                    disabled={!name.trim() || profileImageBusy}
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
                        group.enter("join", name.trim(), previousCode, profileImage);
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
                    className="receive-call-form join-meeting-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      group.enter("join", name.trim(), code, profileImage);
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
                    <ProfileImagePicker profileImage={profileImage} name={name} disabled={group.joining || group.admissionStatus === "pending" || profileImageBusy} error={profileImageBusy ? "Processing image..." : profileImageError} onSelect={selectProfileImage} onRemove={removeProfileImage} />
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
                        profileImageBusy ||
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
                      group.enter("create", name.trim(), "", profileImage);
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
                    <ProfileImagePicker profileImage={profileImage} name={name} disabled={group.joining || profileImageBusy} error={profileImageBusy ? "Processing image..." : profileImageError} onSelect={selectProfileImage} onRemove={removeProfileImage} />
                    <p className="location-sharing-note">Your browser will ask to share your location. Meeting admins can view it on a map.</p>
                    <button
                      className="connect-call-button"
                      disabled={
                        !group.online || group.joining || profileImageBusy || !name.trim()
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
                ) : (
                  <div className={`camera-grid ${group.members.length === 0 ? "is-single" : ""}`}>{cameraTiles}</div>
                )}
              </section>
            )}
            {group.room && screenCount > 0 && (
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
                  className={`m-icon rescue-mode-control ${group.rescueMode ? "is-active" : ""}`}
                  title={`Connection quality: ${group.connectionQuality}. ${group.rescueMode ? "Turn rescue mode off" : "Turn on weak-network rescue"}`}
                  aria-label={`${group.rescueMode ? "Disable" : "Enable"} weak-network rescue mode. Connection quality: ${group.connectionQuality}.`}
                  aria-pressed={group.rescueMode}
                  disabled={!group.room}
                  onClick={() => group.setRescueMode(!group.rescueMode)}
                >
                  <Gauge size={16} />
                  <span>{group.rescueMode ? "Rescue on" : "Rescue"}</span>
                  <span className="connection-quality-label">
                    {group.connectionQuality === "poor" ? "Weak" : group.connectionQuality === "unstable" || group.connectionQuality === "connecting" ? "Fair" : group.connectionQuality === "good" ? "Good" : "…"}
                  </span>
                  <i className={`connection-quality-dot quality-${group.connectionQuality}`} />
                </button>
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
                    const wasViewingChat = chatOpen && tab === "chat";
                    setTab("chat");
                    if (wasViewingChat) setChatOpen(false);
                    else {
                      setUnreadMessageCount(0);
                      setChatOpen(true);
                    }
                  }}
                >
                  <MessageSquare size={18} />
                  {unreadMessageCount > 0 && (
                    <span className="chat-count" aria-label={`${unreadMessageCount} unread messages`}>
                      {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                    </span>
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
                    : "Group capacity is up to 1,000 members. Large groups may overload browsers without an SFU."}{" "}
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
