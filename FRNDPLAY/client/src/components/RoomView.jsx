import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import YouTubePlayer from "./YouTubePlayer";
import QueuePanel from "./QueuePanel";
import RoomChat from "./RoomChat";

function getRoomCodeFromUrl() {
  try {
    const url = new URL(window.location.href);
    return (
      url.searchParams.get("room") ||
      url.searchParams.get("code") ||
      url.searchParams.get("roomCode") ||
      ""
    )
      .toUpperCase()
      .trim();
  } catch {
    return "";
  }
}

function isValidYouTubeId(value) {
  return /^[a-zA-Z0-9_-]{11}$/.test(String(value || "").trim());
}

function toSafeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatParticipantLabel(p, hostUserId) {
  const email = String(p?.email || "").trim().toLowerCase();
  const short =
    email && email.includes("@") ? email.split("@")[0] : "guest";
  const isHostParticipant =
    p?.userId && hostUserId && String(p.userId) === String(hostUserId);

  return {
    id: p?.presenceId || `${p?.userId || "anon"}-${short}`,
    name: short,
    isHost: !!isHostParticipant,
  };
}

export default function RoomView() {
  const roomCode = useMemo(() => getRoomCodeFromUrl(), []);
  const [loading, setLoading] = useState(true);

  const [session, setSession] = useState(null);
  const [room, setRoom] = useState(null);
  const [role, setRole] = useState("GUEST");

  const [nowVideoId, setNowVideoId] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);

  const [hostTime, setHostTime] = useState(0);
  const [localTime, setLocalTime] = useState(0);

  const [seekTo, setSeekTo] = useState(null);
  const [participants, setParticipants] = useState([]);

  const playerCtrlRef = useRef(null);
  const advancingRef = useRef(false);
  const isHostRef = useRef(false);

  const isHost = role === "HOST";

  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  const getExactPlayerTime = () => {
    const exact = playerCtrlRef.current?.getTime?.();
    return Number.isFinite(exact) ? exact : localTime;
  };

  const getCurrentQueueMeta = async (videoId) => {
    if (!room?.id || !isValidYouTubeId(videoId)) {
      return {
        title: "",
        thumbnail: "",
      };
    }

    try {
      const { data, error } = await supabase
        .from("queue_items")
        .select("title, thumbnail")
        .eq("room_id", String(room.id))
        .eq("video_id", String(videoId).trim())
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) throw error;

      const item = data?.[0] || null;

      return {
        title: String(item?.title || "").trim(),
        thumbnail: String(item?.thumbnail || "").trim(),
      };
    } catch {
      return {
        title: "",
        thumbnail: "",
      };
    }
  };

  const addToPlaybackHistory = async (videoId) => {
    if (!room?.id || !isValidYouTubeId(videoId)) return;

    try {
      const meta = await getCurrentQueueMeta(videoId);

      await supabase.from("playback_history").insert({
        room_id: String(room.id),
        video_id: String(videoId).trim(),
        title: meta.title || null,
        thumbnail: meta.thumbnail || null,
      });
    } catch (err) {
      console.warn("Playback history insert failed:", err);
    }
  };

  const getPreviousHistoryTrack = async () => {
    if (!room?.id) return null;

    try {
      const currentId = String(nowVideoId || "").trim();

      const { data, error } = await supabase
        .from("playback_history")
        .select("*")
        .eq("room_id", String(room.id))
        .order("played_at", { ascending: false })
        .limit(10);

      if (error) throw error;

      const list = data || [];
      if (list.length === 0) return null;

      if (!currentId) {
        return list[0] || null;
      }

      const previous = list.find(
        (row) => String(row.video_id || "").trim() !== currentId
      );

      return previous || null;
    } catch (err) {
      console.warn("Previous history lookup failed:", err);
      return null;
    }
  };

  useEffect(() => {
    let alive = true;

    async function initAuth() {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setSession(data?.session ?? null);
    }

    initAuth();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, next) => {
      setSession(next ?? null);
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function boot() {
      setLoading(true);

      if (!roomCode) {
        setLoading(false);
        return;
      }

      const { data: rooms, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", roomCode)
        .limit(1);

      if (!alive) return;

      if (error) {
        console.error("Fetch room error:", error);
        setLoading(false);
        return;
      }

      const r = rooms?.[0] || null;
      if (!r) {
        console.error("Room not found for code:", roomCode);
        setLoading(false);
        return;
      }

      const t = toSafeNumber(r.now_time, 0);

      setRoom(r);
      setNowVideoId(String(r.now_video_id || "").trim());
      setIsPlaying(!!r.now_playing);
      setHostTime(t);
      setLocalTime(t);

      setLoading(false);
    }

    boot();

    return () => {
      alive = false;
    };
  }, [roomCode]);

  useEffect(() => {
    if (!room?.id) return;

    const userId = session?.user?.id || null;

    if (!userId) {
      setRole("GUEST");
      return;
    }

    if (room.host_user_id) {
      setRole(room.host_user_id === userId ? "HOST" : "GUEST");
      return;
    }

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("rooms")
        .update({ host_user_id: userId })
        .eq("id", room.id)
        .is("host_user_id", null)
        .select()
        .limit(1);

      if (cancelled) return;

      if (error) {
        console.warn("Host claim failed:", error);
        setRole("GUEST");
        return;
      }

      const updated = data?.[0] || null;

      if (updated?.host_user_id === userId) {
        setRoom(updated);
        setRole("HOST");
      } else {
        setRole("GUEST");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [room?.id, room?.host_user_id, session?.user?.id]);

  useEffect(() => {
    if (!room?.id) return;

    const presenceChannel = supabase.channel(`presence:room:${room.id}`, {
      config: {
        presence: {
          key: session?.user?.id || `anon-${Math.random().toString(36).slice(2)}`,
        },
      },
    });

    const syncParticipants = () => {
      const state = presenceChannel.presenceState();
      const flat = Object.values(state).flatMap((entries) => entries || []);

      const mapped = flat.map((entry) =>
        formatParticipantLabel(
          {
            presenceId: entry.presenceId,
            userId: entry.userId,
            email: entry.email,
          },
          room?.host_user_id
        )
      );

      const deduped = [];
      const seen = new Set();

      for (const p of mapped) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        deduped.push(p);
      }

      deduped.sort((a, b) => {
        if (a.isHost && !b.isHost) return -1;
        if (!a.isHost && b.isHost) return 1;
        return a.name.localeCompare(b.name);
      });

      setParticipants(deduped);
    };

    presenceChannel
      .on("presence", { event: "sync" }, syncParticipants)
      .on("presence", { event: "join" }, syncParticipants)
      .on("presence", { event: "leave" }, syncParticipants);

    presenceChannel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await presenceChannel.track({
          presenceId:
            session?.user?.id ||
            `anon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          userId: session?.user?.id || null,
          email: session?.user?.email || "guest@frndplay.local",
          roomCode,
          joinedAt: new Date().toISOString(),
        });
      }
    });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [room?.id, room?.host_user_id, roomCode, session?.user?.email, session?.user?.id]);

  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase
      .channel(`room:${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${room.id}`,
        },
        (payload) => {
          const next = payload?.new;
          if (!next) return;

          const nextVideoId = String(next.now_video_id || "").trim();
          const nextPlaying = !!next.now_playing;
          const nextTime = toSafeNumber(next.now_time, 0);

          setRoom(next);
          setNowVideoId(nextVideoId);
          setIsPlaying(nextPlaying);
          setHostTime(nextTime);

          if (!isHostRef.current) {
            const playerTime = playerCtrlRef.current?.getTime?.();
            const currentGuestTime = Number.isFinite(playerTime)
              ? playerTime
              : localTime;

            const drift = Math.abs(currentGuestTime - nextTime);
            const shouldSnap =
              !isValidYouTubeId(nextVideoId) ||
              !Number.isFinite(currentGuestTime) ||
              drift > 1.25 ||
              nextPlaying === false;

            if (shouldSnap) {
              setSeekTo(nextTime);
              setLocalTime(nextTime);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id, localTime]);

  useEffect(() => {
    if (!room?.id || !isHost) return;
    if (!isValidYouTubeId(nowVideoId)) return;
    if (!isPlaying) return;

    const interval = setInterval(async () => {
      const exact = getExactPlayerTime();
      setLocalTime(exact);
      setHostTime(exact);

      try {
        await supabase
          .from("rooms")
          .update({
            now_video_id: nowVideoId,
            now_playing: true,
            now_time: exact,
            now_updated_at: new Date().toISOString(),
          })
          .eq("id", room.id);
      } catch (err) {
        console.warn("Heartbeat update failed:", err);
      }
    }, 1200);

    return () => clearInterval(interval);
  }, [room?.id, isHost, nowVideoId, isPlaying]);

  const handleHostSetVideo = async (videoId, options = {}) => {
    if (!room?.id || !isHost) return;

    const id = String(videoId || "").trim();
    if (!isValidYouTubeId(id)) {
      console.warn("Refusing to play invalid video id:", id);
      return;
    }

    const shouldWriteHistory = options.writeHistory !== false;

    if (shouldWriteHistory) {
      await addToPlaybackHistory(id);
    }

    setNowVideoId(id);
    setIsPlaying(true);
    setHostTime(0);
    setLocalTime(0);
    setSeekTo(0);

    playerCtrlRef.current?.load?.(id, 0);

    setTimeout(() => {
      playerCtrlRef.current?.play?.();
    }, 120);

    await supabase
      .from("rooms")
      .update({
        now_video_id: id,
        now_playing: true,
        now_time: 0,
        now_updated_at: new Date().toISOString(),
      })
      .eq("id", room.id);
  };

  const handleHostPlay = async () => {
    if (!room?.id || !isHost || !isValidYouTubeId(nowVideoId)) return;

    const exact = getExactPlayerTime();

    setLocalTime(exact);
    setHostTime(exact);
    setIsPlaying(true);

    playerCtrlRef.current?.seek?.(exact);
    playerCtrlRef.current?.play?.();

    await supabase
      .from("rooms")
      .update({
        now_playing: true,
        now_time: exact,
        now_updated_at: new Date().toISOString(),
      })
      .eq("id", room.id);
  };

  const handleHostPause = async () => {
    if (!room?.id || !isHost || !isValidYouTubeId(nowVideoId)) return;

    const exact = getExactPlayerTime();

    setLocalTime(exact);
    setHostTime(exact);
    setIsPlaying(false);

    playerCtrlRef.current?.seek?.(exact);
    playerCtrlRef.current?.pause?.();

    await supabase
      .from("rooms")
      .update({
        now_playing: false,
        now_time: exact,
        now_updated_at: new Date().toISOString(),
      })
      .eq("id", room.id);
  };

  const handleSkip = async () => {
    if (!room?.id || !isHost) return;
    await handleEnded();
  };

  const handlePrevious = async () => {
    if (!room?.id || !isHost || !isValidYouTubeId(nowVideoId)) return;

    const exact = getExactPlayerTime();

    if (exact > 3) {
      setLocalTime(0);
      setHostTime(0);
      setSeekTo(0);

      playerCtrlRef.current?.seek?.(0);

      if (isPlaying) {
        playerCtrlRef.current?.play?.();
      } else {
        playerCtrlRef.current?.pause?.();
      }

      await supabase
        .from("rooms")
        .update({
          now_time: 0,
          now_updated_at: new Date().toISOString(),
        })
        .eq("id", room.id);

      return;
    }

    const previous = await getPreviousHistoryTrack();
    const previousId = String(previous?.video_id || "").trim();

    if (!isValidYouTubeId(previousId)) return;

    await handleHostSetVideo(previousId, { writeHistory: false });
  };

  const handleEnded = async () => {
    if (!room?.id || !isHost) return;
    if (advancingRef.current) return;

    advancingRef.current = true;

    try {
      const finishedVideoId = String(nowVideoId || "").trim();

      const { data: list, error } = await supabase
        .from("queue_items")
        .select("*")
        .eq("room_id", String(room.id))
        .order("position", { ascending: true });

      if (error) {
        console.warn("Auto-advance load error:", error);
        return;
      }

      const items = list || [];
      const currentIndex = items.findIndex(
        (x) => String(x.video_id || "").trim() === finishedVideoId
      );

      const finished = currentIndex >= 0 ? items[currentIndex] : null;
      const next = currentIndex >= 0 ? items[currentIndex + 1] : null;

      if (finished?.id) {
        const { error: deleteErr } = await supabase
          .from("queue_items")
          .delete()
          .eq("id", finished.id);

        if (deleteErr) {
          console.warn("Auto-advance delete failed:", deleteErr);
        }
      }

      if (!next?.video_id || !isValidYouTubeId(next.video_id)) {
        setNowVideoId("");
        setIsPlaying(false);
        setHostTime(0);
        setLocalTime(0);
        setSeekTo(null);

        await supabase
          .from("rooms")
          .update({
            now_video_id: "",
            now_playing: false,
            now_time: 0,
            now_updated_at: new Date().toISOString(),
          })
          .eq("id", room.id);

        return;
      }

      await handleHostSetVideo(next.video_id);
    } finally {
      advancingRef.current = false;
    }
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;

    try {
      await navigator.clipboard?.writeText(url);
      alert("Share link copied.");
    } catch {
      window.prompt("Copy this room link:", url);
    }
  };

  if (loading) {
    return <div style={{ padding: 24 }}>Loading room...</div>;
  }

  if (!roomCode) {
    return <div style={{ padding: 24 }}>Missing room code in URL.</div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Room</h1>
          <div style={{ opacity: 0.8 }}>Code: {roomCode}</div>
        </div>

        <button
          onClick={handleCopyLink}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "white",
            cursor: "pointer",
          }}
        >
          Copy Share Link
        </button>
      </div>

      <div
        style={{
          marginTop: 16,
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 14,
          background: "#fff",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 10 }}>
          In this room ({participants.length})
        </div>

        {participants.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No active listeners detected yet.</div>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {participants.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: "1px solid #d1d5db",
                  background: p.isHost ? "#111" : "#fff",
                  color: p.isHost ? "#fff" : "#111",
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {p.name}
                {p.isHost ? " • host" : ""}
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 24,
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr",
          gap: 18,
        }}
      >
        <div>
          <h2 style={{ margin: "0 0 6px" }}>Room: {roomCode}</h2>
          <div style={{ marginBottom: 12, opacity: 0.85 }}>
            Your role: <b>{role}</b>{" "}
            {isHost ? (
              <span style={{ opacity: 0.7 }}>(one true host)</span>
            ) : null}
          </div>

          <h3 style={{ margin: "18px 0 8px" }}>Now playing</h3>
          <div style={{ marginBottom: 10, opacity: 0.8 }}>
            {isHost
              ? "You're the host — everyone stays synced to you."
              : "Host controls playback."}
          </div>

          <div style={{ marginBottom: 10, opacity: 0.7 }}>
            {isValidYouTubeId(nowVideoId)
              ? `${nowVideoId} • ${Math.floor((isHost ? localTime : hostTime) || 0)}s`
              : "No video selected"}
          </div>

          {isValidYouTubeId(nowVideoId) ? (
            <YouTubePlayer
              videoId={nowVideoId}
              playing={isPlaying}
              startSeconds={isHost ? 0 : hostTime}
              seekTo={isHost ? null : seekTo}
              muted={!isHost}
              onTime={(t) => {
                setLocalTime(t);
              }}
              onEnded={handleEnded}
              onController={(ctrl) => {
                playerCtrlRef.current = ctrl;
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                aspectRatio: "16/9",
                background: "#000",
                borderRadius: 12,
              }}
            />
          )}

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              disabled={!isHost || !isValidYouTubeId(nowVideoId)}
              onClick={handlePrevious}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: !isHost || !isValidYouTubeId(nowVideoId) ? "#f3f3f3" : "white",
                cursor: !isHost || !isValidYouTubeId(nowVideoId) ? "not-allowed" : "pointer",
              }}
            >
              Previous
            </button>

            <button
              disabled={!isHost || !isValidYouTubeId(nowVideoId)}
              onClick={handleHostPlay}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: !isHost || !isValidYouTubeId(nowVideoId) ? "#f3f3f3" : "white",
                cursor: !isHost || !isValidYouTubeId(nowVideoId) ? "not-allowed" : "pointer",
              }}
            >
              Play
            </button>

            <button
              disabled={!isHost || !isValidYouTubeId(nowVideoId)}
              onClick={handleHostPause}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: !isHost || !isValidYouTubeId(nowVideoId) ? "#f3f3f3" : "white",
                cursor: !isHost || !isValidYouTubeId(nowVideoId) ? "not-allowed" : "pointer",
              }}
            >
              Pause
            </button>

            <button
              disabled={!isHost}
              onClick={handleSkip}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: !isHost ? "#f3f3f3" : "white",
                cursor: !isHost ? "not-allowed" : "pointer",
              }}
            >
              Skip
            </button>
          </div>

          <RoomChat roomId={room?.id} />
        </div>

        <div>
          <QueuePanel roomId={room?.id} isHost={isHost} onPlay={handleHostSetVideo} />
        </div>
      </div>
    </div>
  );
}