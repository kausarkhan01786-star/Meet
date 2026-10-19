import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

let youtubeApiPromise;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(() => reject(new Error("YouTube player could not load.")), 15000);
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout);
      previousReady?.();
      resolve(window.YT);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("YouTube player could not load."));
      };
      document.head.appendChild(script);
    }
  });
  return youtubeApiPromise;
}

export const SharedMediaPlayer = forwardRef(function SharedMediaPlayer({ media, selfId, canControl, onPlaybackSync }, ref) {
  const playerRef = useRef(null);
  const hostRef = useRef(null);
  const syncRef = useRef(onPlaybackSync);
  const canControlRef = useRef(canControl);
  const localPlaybackActionRef = useRef(false);
  const localActionTimeoutRef = useRef(null);
  const lastAppliedUpdateRef = useRef(0);
  const localPauseRef = useRef(false);
  const mediaRef = useRef(media);
  const [ready, setReady] = useState(false);
  const [locallyPaused, setLocallyPaused] = useState(false);
  const [locallyMuted, setLocallyMuted] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [playbackError, setPlaybackError] = useState("");

  syncRef.current = onPlaybackSync;
  canControlRef.current = canControl;
  mediaRef.current = media;
  localPauseRef.current = locallyPaused;

  useImperativeHandle(ref, () => ({
    play: () => {
      playerRef.current?.playVideo?.();
      setLocallyPaused(false);
      localPauseRef.current = false;
    },
    pause: () => {
      playerRef.current?.pauseVideo?.();
      setLocallyPaused(true);
      localPauseRef.current = true;
    },
  }), []);

  useEffect(() => {
    let cancelled = false;
    let player;
    loadYouTubeApi().then((YT) => {
      if (cancelled || !hostRef.current) return;
      player = new YT.Player(hostRef.current, {
        width: "100%",
        height: "100%",
        videoId: media.videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          enablejsapi: 1,
          origin: window.location.origin,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady(event) {
            if (cancelled) return;
            playerRef.current = event.target;
            setReady(true);
            event.target.setVolume(100);
            if (locallyMuted) event.target.mute();
            if (mediaRef.current.isPlaying) event.target.playVideo();
          },
          onStateChange(event) {
            if (cancelled) return;
            const isPlaying = event.data === YT.PlayerState.PLAYING;
            if (event.data === YT.PlayerState.PLAYING) {
              setAutoplayBlocked(false);
              setPlaybackError("");
              if (!localPauseRef.current) setLocallyPaused(false);
            }
            if (canControlRef.current && !localPlaybackActionRef.current && (event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED)) {
              syncRef.current?.({ currentTime: event.target.getCurrentTime(), isPlaying });
            }
          },
          onAutoplayBlocked() {
            if (!cancelled) setAutoplayBlocked(true);
          },
          onError(event) {
            if (!cancelled) setPlaybackError(event.data === 101 || event.data === 150 ? "This YouTube video cannot be embedded." : "YouTube could not play this video.");
          },
        },
      });
      playerRef.current = player;
    }).catch((error) => {
      if (!cancelled) setPlaybackError(error.message || "YouTube player could not load.");
    });
    return () => {
      cancelled = true;
      window.clearTimeout(localActionTimeoutRef.current);
      setReady(false);
      playerRef.current = null;
      try { player?.destroy(); } catch {}
    };
  }, [media.videoId]);

  useEffect(() => {
    if (!ready || !media.updatedAt || media.updatedAt === lastAppliedUpdateRef.current || media.controllerId === selfId) return;
    lastAppliedUpdateRef.current = media.updatedAt;
    const player = playerRef.current;
    if (!player) return;
    const currentTime = player.getCurrentTime?.() || 0;
    if (Number.isFinite(media.currentTime) && Math.abs(currentTime - media.currentTime) > 1.5) player.seekTo(media.currentTime, true);
    if (media.isPlaying && !localPauseRef.current) player.playVideo();
    else if (!media.isPlaying) player.pauseVideo();
  }, [ready, media.updatedAt, media.currentTime, media.isPlaying, media.controllerId, selfId]);

  useEffect(() => {
    if (!ready || !canControl) return;
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (player?.getPlayerState?.() === window.YT?.PlayerState?.PLAYING) {
        syncRef.current?.({ currentTime: player.getCurrentTime(), isPlaying: true });
      }
    }, 10000);
    return () => window.clearInterval(timer);
  }, [ready, canControl]);

  function toggleLocalPlayback() {
    localPlaybackActionRef.current = true;
    window.clearTimeout(localActionTimeoutRef.current);
    localActionTimeoutRef.current = window.setTimeout(() => { localPlaybackActionRef.current = false; }, 1200);
    if (locallyPaused) {
      playerRef.current?.playVideo?.();
      setLocallyPaused(false);
      localPauseRef.current = false;
      setAutoplayBlocked(false);
    } else {
      playerRef.current?.pauseVideo?.();
      setLocallyPaused(true);
      localPauseRef.current = true;
    }
  }

  function toggleLocalMute() {
    if (locallyMuted) playerRef.current?.unMute?.();
    else playerRef.current?.mute?.();
    setLocallyMuted((current) => !current);
  }

  return <div className={`shared-media-player ${media.kind === "audio" ? "is-audio" : "is-video"}`}>
    <div className="shared-media-youtube-frame"><div ref={hostRef} /></div>
    <div className="shared-media-local-controls" aria-label="Local playback controls">
      <button type="button" onClick={toggleLocalPlayback} disabled={!ready} title={locallyPaused ? "Resume on this device" : "Pause on this device"}>{locallyPaused ? <Play size={14} /> : <Pause size={14} />}{locallyPaused ? "Resume for me" : "Pause for me"}</button>
      <button type="button" onClick={toggleLocalMute} disabled={!ready} title={locallyMuted ? "Unmute on this device" : "Mute on this device"}>{locallyMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}{locallyMuted ? "Unmute for me" : "Mute for me"}</button>
      {autoplayBlocked && <button type="button" className="shared-media-enable" onClick={() => { playerRef.current?.playVideo?.(); setAutoplayBlocked(false); }}>Tap to enable playback</button>}
    </div>
    {playbackError && <p className="shared-media-error" role="status">{playbackError}</p>}
  </div>;
});
