import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

let youtubeApiPromise;

function formatTime(value) {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

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

const YouTubeSharedMediaPlayer = forwardRef(function YouTubeSharedMediaPlayer({ media, selfId, canControl, onPlaybackSync }, ref) {
  const playerRef = useRef(null);
  const hostRef = useRef(null);
  const syncRef = useRef(onPlaybackSync);
  const canControlRef = useRef(canControl);
  const localPlaybackActionRef = useRef(false);
  const remotePlaybackActionRef = useRef(false);
  const localActionTimeoutRef = useRef(null);
  const lastAppliedUpdateRef = useRef(0);
  const localPauseRef = useRef(false);
  const mediaRef = useRef(media);
  const [ready, setReady] = useState(false);
  const [locallyPaused, setLocallyPaused] = useState(false);
  const [locallyMuted, setLocallyMuted] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [playbackError, setPlaybackError] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);

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
            if (canControlRef.current && !localPlaybackActionRef.current && !remotePlaybackActionRef.current && (event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED)) {
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
    remotePlaybackActionRef.current = true;
    window.setTimeout(() => { remotePlaybackActionRef.current = false; }, 800);
    const currentTime = player.getCurrentTime?.() || 0;
    if (Number.isFinite(media.currentTime) && Math.abs(currentTime - media.currentTime) > 1.5) player.seekTo(media.currentTime, true);
    if (media.isPlaying && !localPauseRef.current) player.playVideo();
    else if (!media.isPlaying) player.pauseVideo();
  }, [ready, media.updatedAt, media.currentTime, media.isPlaying, media.controllerId, selfId]);

  useEffect(() => {
    if (!ready || !canControl || media.controllerId !== selfId) return;
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (player?.getPlayerState?.() === window.YT?.PlayerState?.PLAYING) {
        syncRef.current?.({ currentTime: player.getCurrentTime(), isPlaying: true });
      }
    }, 10000);
    return () => window.clearInterval(timer);
  }, [ready, canControl, media.controllerId, selfId]);

  useEffect(() => {
    if (!ready) return undefined;
    const updateProgress = () => {
      const player = playerRef.current;
      if (!player) return;
      setCurrentTime(player.getCurrentTime?.() || 0);
      setDuration(player.getDuration?.() || 0);
    };
    updateProgress();
    const timer = window.setInterval(updateProgress, 500);
    return () => window.clearInterval(timer);
  }, [ready]);

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

  function seekForEveryone(event) {
    const nextTime = Number(event.target.value);
    if (!Number.isFinite(nextTime)) return;
    playerRef.current?.seekTo?.(nextTime, true);
    setCurrentTime(nextTime);
    if (canControlRef.current) syncRef.current?.({ currentTime: nextTime, isPlaying: playerRef.current?.getPlayerState?.() === window.YT?.PlayerState?.PLAYING });
  }

  function changeVolume(event) {
    const nextVolume = Number(event.target.value);
    playerRef.current?.setVolume?.(nextVolume);
    setVolume(nextVolume);
    if (nextVolume > 0 && locallyMuted) {
      playerRef.current?.unMute?.();
      setLocallyMuted(false);
    }
  }

  return <div className={`shared-media-player ${media.kind === "audio" ? "is-audio" : "is-video"}`}>
    {media.kind === "audio" && <div className="shared-media-audio-artwork">
      <img src={`https://i.ytimg.com/vi/${media.videoId}/hqdefault.jpg`} alt="" />
      <span><Volume2 size={28} /><strong>Shared YouTube Music</strong><small>Audio only</small></span>
    </div>}
    <div className="shared-media-youtube-frame" aria-hidden={media.kind === "audio"}><div ref={hostRef} /></div>
    {media.kind === "audio" && <div className="shared-media-audio-controls">
      <label className="shared-media-seek"><span>{formatTime(currentTime)} / {formatTime(duration)}</span><input type="range" min="0" max={Math.max(1, duration)} step="0.1" value={Math.min(currentTime, Math.max(1, duration))} onChange={seekForEveryone} disabled={!ready || !duration || !canControl} aria-label="Seek shared audio for everyone" /></label>
      <label className="shared-media-volume"><Volume2 size={14} /><input type="range" min="0" max="100" value={volume} onChange={changeVolume} disabled={!ready} aria-label="Volume on this device" /></label>
    </div>}
    <div className="shared-media-local-controls" aria-label="Local playback controls">
      <button type="button" onClick={toggleLocalPlayback} disabled={!ready} title={locallyPaused ? "Resume on this device" : "Pause on this device"}>{locallyPaused ? <Play size={14} /> : <Pause size={14} />}{locallyPaused ? "Resume for me" : "Pause for me"}</button>
      <button type="button" onClick={toggleLocalMute} disabled={!ready} title={locallyMuted ? "Unmute on this device" : "Mute on this device"}>{locallyMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}{locallyMuted ? "Unmute for me" : "Mute for me"}</button>
      {autoplayBlocked && <button type="button" className="shared-media-enable" onClick={() => { playerRef.current?.playVideo?.(); setAutoplayBlocked(false); }}>Tap to enable playback</button>}
    </div>
    {playbackError && <p className="shared-media-error" role="status">{playbackError}</p>}
  </div>;
});

const DirectMediaPlayer = forwardRef(function DirectMediaPlayer({ media, selfId, canControl, onPlaybackSync }, ref) {
  const elementRef = useRef(null);
  const syncRef = useRef(onPlaybackSync);
  const localPauseRef = useRef(false);
  const applyingRef = useRef(false);
  const lastAppliedUpdateRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [locallyPaused, setLocallyPaused] = useState(false);
  const [locallyMuted, setLocallyMuted] = useState(false);
  const [error, setError] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  syncRef.current = onPlaybackSync;

  useImperativeHandle(ref, () => ({
    play: () => { elementRef.current?.play?.().catch(() => {}); setLocallyPaused(false); localPauseRef.current = false; },
    pause: () => { elementRef.current?.pause?.(); setLocallyPaused(true); localPauseRef.current = true; },
  }), []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !ready || media.updatedAt === lastAppliedUpdateRef.current || media.controllerId === selfId) return;
    lastAppliedUpdateRef.current = media.updatedAt;
    applyingRef.current = true;
    if (Number.isFinite(media.currentTime) && Math.abs(element.currentTime - media.currentTime) > 1.5) element.currentTime = media.currentTime;
    if (media.isPlaying && !localPauseRef.current) element.play().catch(() => {});
    else if (!media.isPlaying) element.pause();
    window.setTimeout(() => { applyingRef.current = false; }, 250);
  }, [ready, media.updatedAt, media.currentTime, media.isPlaying, media.controllerId, selfId]);

  const sync = (isPlaying) => {
    if (canControl && !applyingRef.current) syncRef.current?.({ currentTime: elementRef.current?.currentTime || 0, isPlaying });
  };
  const localPause = () => {
    const element = elementRef.current;
    if (!element) return;
    localPauseRef.current = !localPauseRef.current;
    setLocallyPaused(localPauseRef.current);
    if (localPauseRef.current) element.pause();
    else element.play().catch(() => {});
  };
  const localMute = () => {
    const element = elementRef.current;
    if (!element) return;
    element.muted = !element.muted;
    setLocallyMuted(element.muted);
  };
  const seekForEveryone = (event) => {
    const nextTime = Number(event.target.value);
    const element = elementRef.current;
    if (!element || !Number.isFinite(nextTime)) return;
    element.currentTime = nextTime;
    setCurrentTime(nextTime);
    if (canControl) syncRef.current?.({ currentTime: nextTime, isPlaying: !element.paused });
  };
  const changeVolume = (event) => {
    const nextVolume = Number(event.target.value);
    const element = elementRef.current;
    if (!element) return;
    element.volume = nextVolume / 100;
    setVolume(nextVolume);
  };
  const sharedProps = { ref: elementRef, src: media.sourceUrl, controls: media.kind === "video", onCanPlay: () => { setReady(true); setDuration(elementRef.current?.duration || 0); setError(""); if (media.isPlaying && !localPauseRef.current) elementRef.current?.play?.().catch(() => {}); }, onTimeUpdate: () => setCurrentTime(elementRef.current?.currentTime || 0), onPlay: () => sync(true), onPause: () => sync(false), onError: () => setError("This site did not provide a browser-playable media stream."), playsInline: true };
  return <div className={`shared-media-player direct-media-player ${media.kind === "audio" ? "is-audio" : "is-video"}`}>
    {media.kind === "audio" ? <audio className="shared-media-direct-audio" {...sharedProps} /> : <video className="shared-media-direct-video" {...sharedProps} />}
    {media.kind === "audio" && <div className="shared-media-audio-controls">
      <label className="shared-media-seek"><span>{formatTime(currentTime)} / {formatTime(duration)}</span><input type="range" min="0" max={Math.max(1, duration)} step="0.1" value={Math.min(currentTime, Math.max(1, duration))} onChange={seekForEveryone} disabled={!ready || !duration || !canControl} aria-label="Seek shared audio for everyone" /></label>
      <label className="shared-media-volume"><Volume2 size={14} /><input type="range" min="0" max="100" value={volume} onChange={changeVolume} disabled={!ready} aria-label="Volume on this device" /></label>
    </div>}
    <div className="shared-media-local-controls" aria-label="Local playback controls">
      <button type="button" onClick={localPause} disabled={!ready}>{locallyPaused ? <Play size={14} /> : <Pause size={14} />}{locallyPaused ? "Resume for me" : "Pause for me"}</button>
      <button type="button" onClick={localMute} disabled={!ready}>{locallyMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}{locallyMuted ? "Unmute for me" : "Mute for me"}</button>
    </div>
    {error && <p className="shared-media-error" role="status">{error}</p>}
  </div>;
});

export const SharedMediaPlayer = forwardRef(function SharedMediaPlayer(props, ref) {
  return props.media.sourceUrl
    ? <DirectMediaPlayer {...props} ref={ref} />
    : <YouTubeSharedMediaPlayer {...props} ref={ref} />;
});
