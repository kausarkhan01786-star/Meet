export const REACTIONS = [
  { id: "like", label: "Like", emoji: "\u{1F44D}" },
  { id: "love", label: "Love", emoji: "\u2764\uFE0F" },
  { id: "applause", label: "Applause", emoji: "\u{1F44F}" },
  { id: "laugh", label: "Laugh", emoji: "\u{1F602}" },
  { id: "celebrate", label: "Celebrate", emoji: "\u{1F389}" },
  { id: "wow", label: "Wow", emoji: "\u{1F62E}" },
];

export const CHAT_EMOJIS = ["\u{1F600}", "\u{1F60A}", "\u{1F602}", "\u{1F44D}", "\u{1F44F}", "\u2764\uFE0F", "\u{1F389}", "\u{1F64C}", "\u{1F4A1}", "\u{1F680}", "\u2705", "\u{1F64F}", "\u{1F914}", "\u{1F60E}", "\u{1F525}", "\u{1F44B}"];

export const MAX_CHAT_FILE_BYTES = 5 * 1024 * 1024;

export function isValidMeetingName(name) {
  return typeof name === "string" && name.trim().length >= 4 && !/\p{N}/u.test(name);
}

export function parseChatContent(message) {
  const kind = message.kind || (message.data ? "file" : "text");
  if (kind === "text") {
    if (typeof message.text !== "string" || !message.text.trim() || message.text.length > 2000) throw new Error("Messages must contain 1 to 2000 characters.");
    return { kind, text: message.text.trim() };
  }
  if (kind === "file") {
    if (typeof message.fileName !== "string" || !message.fileName.trim() || message.fileName.length > 255) throw new Error("Choose a file with a name under 255 characters.");
    if (typeof message.mimeType !== "string" || message.mimeType.length > 150) throw new Error("Invalid file type.");
    if (typeof message.data !== "string") throw new Error("Invalid file data.");
    const match = /^data:([\w.+-]+\/[\w.+-]+|application\/octet-stream)?;base64,([A-Za-z0-9+/]*={0,2})$/.exec(message.data);
    if (!match) throw new Error("This file could not be uploaded.");
    const encoded = match[2];
    if (encoded.length % 4 !== 0) throw new Error("This file could not be uploaded.");
    const bytes = Math.floor(encoded.length * 3 / 4) - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
    if (bytes > MAX_CHAT_FILE_BYTES) throw new Error("Files must be 5 MB or smaller.");
    const safeName = message.fileName.replace(/[\u0000-\u001f\u007f]/g, "").trim();
    if (!safeName) throw new Error("Invalid file name.");
    return { kind, fileName: safeName, mimeType: message.mimeType, data: message.data };
  }
  throw new Error("Unsupported chat message type.");
}
