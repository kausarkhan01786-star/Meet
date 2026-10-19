import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, BarChart3, Crown, FileUp, GraduationCap, Hand, MapPin, MicOff, MoreHorizontal, Shield, Smile, Trash2, X } from "lucide-react";
import { CHAT_EMOJIS, MAX_CHAT_FILE_BYTES, REACTIONS } from "../shared/meeting-content.js";

export function RoleBadge({ role }) {
  if (!["owner", "admin"].includes(role)) return null;
  return <span className={`role-badge role-${role}`}>{role === "owner" ? <Crown size={10} /> : <Shield size={10} />}{role === "owner" ? "Owner" : "Admin"}</span>;
}

export function MemberActions({ group, member }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 8, left: 8 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const allowed = group.isAdmin && member.role !== "owner" && (group.self?.role === "owner" || member.role !== "admin");
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = Math.min(225, window.innerWidth - 16);
      const estimatedHeight = Math.min(270, window.innerHeight - 16);
      const below = window.innerHeight - rect.bottom;
      const top = below >= estimatedHeight + 8 ? rect.bottom + 4 : Math.max(8, rect.top - estimatedHeight - 4);
      const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth));
      setPosition({ top, left });
    };
    const dismiss = (event) => {
      if (event.type === "keydown" && event.key === "Escape") setOpen(false);
      if (event.type === "pointerdown" && !buttonRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, [open]);
  if (!allowed) return null;
  function action(type, extra = {}, close = true) {
    group.adminAction(type, { targetId: member.id, ...extra });
    if (close) setOpen(false);
  }
  return <><div className="member-actions"><button ref={buttonRef} type="button" className="member-actions-trigger" title={`Manage ${member.name}`} aria-label={`Manage ${member.name}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}><MoreHorizontal size={17} /></button></div>{open && createPortal(<div ref={menuRef} className="member-action-menu" style={{ top: position.top, left: position.left }} role="menu" aria-label={`Manage ${member.name}`}><strong>{member.name}</strong><button role="menuitem" onClick={() => action("mute")}><MicOff size={14} /> Mute microphone now</button><div className="member-permissions">{[["microphone", "Allow microphone"], ["camera", "Allow camera"], ["screen", "Allow screen sharing"]].map(([permission, label]) => <label key={permission}><span>{label}</span><input type="checkbox" checked={member.permissions?.[permission] !== false} onChange={(event) => action("permission", { permission, allowed: event.target.checked }, false)} aria-label={`${label} for ${member.name}`} /></label>)}</div>{group.self?.role === "owner" && <button role="menuitem" onClick={() => action("role", { role: member.role === "admin" ? "member" : "admin" })}><Shield size={14} />{member.role === "admin" ? "Revoke admin access" : "Make admin"}</button>}<button role="menuitem" className="remove-member" onClick={() => action("remove")}><Trash2 size={14} /> Remove from meeting</button></div>, document.body)}</>;
}

export function MemberLocation({ member }) {
  const location = member.location;
  if (location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
    const url = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
    return <a className="member-location-trigger" href={url} target="_blank" rel="noopener noreferrer" title={`View ${member.name}'s location on Google Maps`} aria-label={`View ${member.name}'s location on Google Maps`}><MapPin size={15} /></a>;
  }
  return <button className="member-location-trigger is-unavailable" type="button" disabled title={`${member.name}'s location is unavailable`} aria-label={`${member.name}'s location is unavailable`}><MapPin size={15} /></button>;
}

export function RichMessage({ message }) {
  if (message.kind === "file") return <a className="chat-file-attachment" href={message.data} download={message.fileName}><FileUp size={18} /><span><strong>{message.fileName}</strong><small>{message.mimeType || "File"}</small></span></a>;
  return <p>{message.text}</p>;
}

export function ChatAttachments({ disabled, studentDisabled = disabled, pollDisabled = disabled, onStudentClick, onPollClick, onEmoji, onSendFile }) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [fileError, setFileError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);
  useEffect(() => { if (disabled) setEmojiOpen(false); }, [disabled]);
  function uploadFile(file) {
    if (!file) return;
    setFileError("");
    if (file.size > MAX_CHAT_FILE_BYTES) {
      setFileError("Files must be 5 MB or smaller.");
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      Promise.resolve(onSendFile({ kind: "file", fileName: file.name, mimeType: file.type || "application/octet-stream", data: reader.result }))
        .then((sent) => { if (!sent) setFileError("The file could not be sent. Please try again."); })
        .catch(() => setFileError("The file could not be sent. Please try again."))
        .finally(() => { setUploading(false); if (fileInput.current) fileInput.current.value = ""; });
    };
    reader.onerror = () => {
      setFileError("Could not read this file.");
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    };
    reader.readAsDataURL(file);
  }
  return <div className="chat-attachments"><div className="chat-attachment-buttons"><button type="button" className={`m-icon ${emojiOpen ? "is-active" : ""}`} disabled={disabled} title="Emoji" aria-label="Emoji" aria-expanded={emojiOpen} onClick={() => setEmojiOpen(!emojiOpen)}><Smile size={16} /></button><button type="button" className="m-icon" disabled={disabled || uploading} title="Upload a file (up to 5 MB)" aria-label="Upload a file" onClick={() => fileInput.current?.click()}><FileUp size={16} /></button>{onStudentClick && <button type="button" className="m-icon" disabled={studentDisabled} title="Submit student information" aria-label="Submit student information" onClick={onStudentClick}><GraduationCap size={16} /></button>}{onPollClick && <button type="button" className="m-icon" disabled={pollDisabled} title="Create a poll" aria-label="Create a poll" onClick={onPollClick}><BarChart3 size={16} /></button>}<input ref={fileInput} className="chat-file-input" type="file" disabled={disabled || uploading} onChange={(event) => uploadFile(event.target.files?.[0])} /></div>{emojiOpen && <div className="chat-media-picker emoji-picker" role="region" aria-label="Emoji picker"><div className="media-picker-heading"><strong>Emoji</strong><button type="button" className="m-icon" title="Close picker" aria-label="Close picker" onClick={() => setEmojiOpen(false)}><X size={15} /></button></div><div className="emoji-options">{CHAT_EMOJIS.map((emoji, index) => <button type="button" key={emoji} onClick={() => onEmoji(emoji)} aria-label={`Insert emoji ${index + 1}`}><span role="img" aria-label={emoji}>{emoji}</span></button>)}</div></div>}{(uploading || fileError) && <span className={`chat-file-feedback ${fileError ? "has-error" : ""}`} role="status">{fileError && <AlertCircle size={12} />}{uploading ? "Uploading…" : fileError}</span>}</div>;
}

export function ReactionControls({ group }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!group.room) setOpen(false); }, [group.room?.selfId]);
  return <><div className="reaction-control-wrap"><button className={`call-control reaction-control ${open ? "is-sharing" : ""}`} disabled={!group.room} title="Meeting reactions" aria-label="Meeting reactions" aria-expanded={open} onClick={() => setOpen(!open)}><Smile size={20} /></button>{open && <div className="meeting-reaction-picker" role="region" aria-label="Choose a reaction">{REACTIONS.map((reaction) => <button key={reaction.id} title={reaction.label} aria-label={`React ${reaction.label}`} onClick={() => { group.react(reaction.id); setOpen(false); }}><span>{reaction.emoji}</span></button>)}</div>}</div><button className={`call-control hand-control ${group.self?.handRaised ? "hand-is-raised" : ""}`} disabled={!group.room} title={group.self?.handRaised ? "Lower hand" : "Raise hand"} aria-label={group.self?.handRaised ? "Lower hand" : "Raise hand"} aria-pressed={Boolean(group.self?.handRaised)} onClick={group.toggleHand}><Hand size={20} /></button></>;
}

export function MeetingReactions({ reactions }) {
  return <div className="meeting-reaction-feed" aria-live="polite" aria-label="Meeting reactions">{reactions.map((item, index) => { const reaction = REACTIONS.find((entry) => entry.id === item.reaction); return reaction ? <div key={item.id} className="meeting-reaction-event" style={{ "--reaction-lane": index % 5 }}><span role="img" aria-label={reaction.label}>{reaction.emoji}</span><strong>{item.name}</strong></div> : null; })}</div>;
}
