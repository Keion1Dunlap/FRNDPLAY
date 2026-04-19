import { useEffect, useRef } from "react";

function isValidYouTubeId(value) {
  return /^[a-zA-Z0-9_-]{11}$/.test(String(value || "").trim());
}

export default function YouTubePlayer({
  videoId,
  playing,
  startSeconds = 0,
  seekTo = null,
  muted = false,
  onTime,
  onEnded,
  onController,
}) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const readyRef = useRef(false);
  const tickerRef = useRef(null);
  const lastLoadedIdRef = useRef("");
  const lastSeekAppliedRef = useRef(null);
  const controllerSentRef = useRef(false);

  const latestVideoIdRef = useRef(videoId);
  const latestPlayingRef = useRef(playing);
  const latestStartRef = useRef(startSeconds);
  const latestMutedRef = useRef(muted);
  const latestOnTimeRef = useRef(onTime);
  const latestOnEndedRef = useRef(onEnded);
  const latestOnControllerRef = useRef(onController);

  useEffect(() => {
    latestVideoIdRef.current = videoId;
  }, [videoId]);

  useEffect(() => {
    latestPlayingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    latestStartRef.current = startSeconds;
  }, [startSeconds]);

  useEffect(() => {
    latestMutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    latestOnTimeRef.current = onTime;
  }, [onTime]);

  useEffect(() => {
    latestOnEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    latestOnControllerRef.current = onController;
  }, [onController]);

  useEffect(() => {
    if (window.YT && window.YT.Player) return;

    const existing = document.getElementById("yt-iframe-api");
    if (existing) return;

    const tag = document.createElement("script");
    tag.id = "yt-iframe-api";
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
  }, []);

  // Create player ONCE
  useEffect(() => {
    let cancelled = false;

    function createPlayer() {
      if (cancelled) return;
      if (!containerRef.current) return;
      if (!window.YT?.Player) return;
      if (playerRef.current) return;

      playerRef.current = new window.YT.Player(containerRef.current, {
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            if (cancelled) return;

            readyRef.current = true;

            try {
              if (latestMutedRef.current) {
                playerRef.current?.mute?.();
              } else {
                playerRef.current?.unMute?.();
              }
            } catch {}

            if (!controllerSentRef.current) {
              latestOnControllerRef.current?.({
                load: (vid, seconds = 0) => {
                  if (!playerRef.current || !readyRef.current) return;
                  if (!isValidYouTubeId(vid)) return;

                  const cleanId = String(vid).trim();

                  playerRef.current.loadVideoById({
                    videoId: cleanId,
                    startSeconds: Math.max(0, Number(seconds) || 0),
                  });

                  lastLoadedIdRef.current = cleanId;
                  lastSeekAppliedRef.current = Math.max(0, Number(seconds) || 0);
                },

                play: () => {
                  if (!playerRef.current || !readyRef.current) return;
                  playerRef.current.playVideo?.();
                },

                pause: () => {
                  if (!playerRef.current || !readyRef.current) return;
                  playerRef.current.pauseVideo?.();
                },

                seek: (seconds) => {
                  if (!playerRef.current || !readyRef.current) return;
                  const safe = Math.max(0, Number(seconds) || 0);
                  playerRef.current.seekTo?.(safe, true);
                  lastSeekAppliedRef.current = safe;
                },

                getTime: () => {
                  if (!playerRef.current || !readyRef.current) return 0;
                  const t = playerRef.current.getCurrentTime?.();
                  return Number.isFinite(t) ? t : 0;
                },
              });

              controllerSentRef.current = true;
            }

            const initialId = String(latestVideoIdRef.current || "").trim();
            const initialStart = Math.max(0, Number(latestStartRef.current) || 0);

            if (isValidYouTubeId(initialId)) {
              try {
                playerRef.current.loadVideoById({
                  videoId: initialId,
                  startSeconds: initialStart,
                });

                lastLoadedIdRef.current = initialId;
                lastSeekAppliedRef.current = initialStart;

                if (latestMutedRef.current) {
                  playerRef.current?.mute?.();
                } else {
                  playerRef.current?.unMute?.();
                }

                if (latestPlayingRef.current) {
                  setTimeout(() => {
                    try {
                      playerRef.current?.playVideo?.();
                    } catch {}
                  }, 120);
                } else {
                  playerRef.current?.pauseVideo?.();
                }
              } catch (err) {
                console.warn("Initial YouTube load failed:", err);
              }
            }
          },

          onStateChange: (e) => {
            if (e?.data === 0) {
              latestOnEndedRef.current?.();
            }
          },

          onError: (e) => {
            console.warn("YouTube player error:", e);
          },
        },
      });

      tickerRef.current = window.setInterval(() => {
        try {
          const p = playerRef.current;
          if (!p || !readyRef.current) return;

          const t = p.getCurrentTime?.();
          if (Number.isFinite(t)) {
            latestOnTimeRef.current?.(t);
          }
        } catch {}
      }, 500);
    }

    if (window.YT?.Player) {
      createPlayer();
    } else {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        createPlayer();
      };
    }

    return () => {
      cancelled = true;
      readyRef.current = false;

      if (tickerRef.current) {
        clearInterval(tickerRef.current);
        tickerRef.current = null;
      }

      try {
        playerRef.current?.destroy?.();
      } catch {}

      playerRef.current = null;
      lastLoadedIdRef.current = "";
      lastSeekAppliedRef.current = null;
      controllerSentRef.current = false;
    };
  }, []);

  // React to muted changes without recreating player
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !readyRef.current) return;

    try {
      if (muted) p.mute?.();
      else p.unMute?.();
    } catch {}
  }, [muted]);

  // Load a new video only when the actual video id changes
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !readyRef.current) return;

    const id = String(videoId || "").trim();
    if (!isValidYouTubeId(id)) return;
    if (lastLoadedIdRef.current === id) return;

    const safeStart = Math.max(0, Number(startSeconds) || 0);

    try {
      p.loadVideoById({
        videoId: id,
        startSeconds: safeStart,
      });

      lastLoadedIdRef.current = id;
      lastSeekAppliedRef.current = safeStart;

      if (!playing) {
        setTimeout(() => {
          try {
            p.pauseVideo?.();
          } catch {}
        }, 120);
      }
    } catch (err) {
      console.warn("Video load effect failed:", err);
    }
  }, [videoId, startSeconds, playing]);

  // Apply play/pause state changes
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    if (!isValidYouTubeId(videoId)) return;

    try {
      if (playing) {
        p.playVideo?.();
      } else {
        p.pauseVideo?.();
      }
    } catch {}
  }, [playing, videoId]);

  // Apply external seek requests
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    if (seekTo == null) return;

    const safeSeek = Math.max(0, Number(seekTo) || 0);
    const last = lastSeekAppliedRef.current;

    if (last != null && Math.abs(last - safeSeek) < 0.35) return;

    try {
      p.seekTo?.(safeSeek, true);
      lastSeekAppliedRef.current = safeSeek;
    } catch {}
  }, [seekTo]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        aspectRatio: "16/9",
        borderRadius: 12,
        overflow: "hidden",
        background: "#000",
      }}
    />
  );
}