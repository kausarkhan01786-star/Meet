import { useEffect, useRef, useState } from "react";
import { Expand, LoaderCircle, MicOff, VideoOff, Volume2 } from "lucide-react";

export function CameraTile({
  stream,
  name,
  local = false,
  enabled = false,
  muted = false,
}) {
  const videoRef = useRef(null);
  const [blocked, setBlocked] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const video = videoRef.current;
    setReady(false);
    if (!enabled || !stream || !video) return;
    video.srcObject = new MediaStream(stream.getVideoTracks());
    video
      .play()
      .then(() => setBlocked(false))
      .catch(() => setBlocked(true));
    return () => {
      video.srcObject = null;
    };
  }, [stream, enabled]);
  return (
    <section
      className={`camera-tile ${local ? "is-local" : ""}`}
      aria-label={local ? "Your camera" : `${name}'s camera`}
    >
      {enabled ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            onLoadedData={() => setReady(true)}
          />
          {!ready && !blocked && (
            <span className="camera-loading">
              <LoaderCircle className="spin" size={22} />
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
              Play video
            </button>
          )}
        </>
      ) : (
        <div className="camera-placeholder">
          <span>{name.slice(0, 2).toUpperCase()}</span>
          <small>
            <VideoOff size={13} /> Camera off
          </small>
        </div>
      )}
      <div className="camera-caption">
        <span>{local ? "You" : name}</span>
        {muted && <MicOff size={14} />}
      </div>
    </section>
  );
}

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
          className="group-enable-audio"
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
  const label = local ? "Your shared screen" : `${name}'s shared screen`;
  return (
    <section className="group-screen" ref={tileRef} aria-label={label}>
      <div className="group-screen-heading">
        <span>{local ? "Your screen" : name}</span>
        <button
          className="icon-button small"
          disabled={!stream}
          title={`Fullscreen ${local ? "your" : name + "'s"} screen`}
          aria-label={`Fullscreen ${local ? "your" : name + "'s"} screen`}
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
