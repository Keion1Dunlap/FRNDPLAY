import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import YouTube from "react-youtube";
import { supabase } from "../supabase";

const SYNC_PUSH_INTERVAL_MS = 1000;
const GUEST_RECONCILE_INTERVAL_MS = 1500;
const SEEK_THRESHOLD_SECONDS = 1.5;
const PAUSED_SEEK_THRESHOLD_SECONDS = 0.5;
const REMOTE_ACTION_LOCK_MS = 450;

function getSessionId() {
  const key = "frndplay_session_id";
  let existing = localStorage.getItem(key);
  if (existing) return existing;

  const created =
    crypto?.randomUUID?.() ||
    `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  localStorage.setItem(key, created);
  return created;
}

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function extractYouTubeId(input) {
  const s = String(input || "").trim();
  if (!s) return "";

  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;

  try {
    const url = new URL(s);
    const v = url.searchParams.get("v");
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

    const parts = url.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && /^[a-zA-Z0-9_-]{11}$/.test(last)) return last;
  } catch {
    return "";
  }

  return "";
}

function getYouTubeThumb(videoId) {
  if (!videoId) return "";
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

async function getYouTubeTitle(videoId) {
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    );

    if (!res.ok) throw new Error("Title fetch failed");

    const data = await res.json();
    return data?.title || `YouTube Video (${videoId})`;
  } catch {
    return `YouTube Video (${videoId})`;
  }
}

function projectHostPlaybackTime(room) {
  const base = safeNum(room?.playback_time, 0);
  if (!room?.is_playing) return base;

  const stamp = room?.last_sync_at || room?.updated_at;
  if (!stamp) return base;

  const elapsed = (Date.now() - new Date(stamp).getTime()) / 1000;
  return Math.max(0, base + elapsed);
}

function normalizeQueuePositions(items) {
  return items.map((item, index) => ({
    ...item,
    position: index + 1,
  }));
}

export default function RoomView() {
  const roomCode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get("room") || "").trim().toUpperCase();
  }, []);

  const sessionId = useMemo(() => getSessionId(), []);
  const [room, setRoom] = useState(null);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [videoInput, setVideoInput] = useState("");
  const [queueBusyId, setQueueBusyId] = useState(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerVideoId, setPlayerVideoId] = useState("");
  const [authUserId, setAuthUserId] = useState(null);
  const [authUserEmail, setAuthUserEmail] = useState("");
  const [userVotes, setUserVotes] = useState([]);
  const playerRef = useRef(null);
  const hostSyncIntervalRef = useRef(null);
  const guestSyncIntervalRef = useRef(null);
  const remoteActionLockRef = useRef(false);
  const advancingRef = useRef(false);
  const roomRef = useRef(null);
  const queueRef = useRef([]);
  const playerVideoIdRef = useRef("");
  const playerReadyRef = useRef(false);

  const isHost = useMemo(() => {
    if (!room) return false;

    return (
      room.owner_id === authUserId ||
      room.host_user_id === authUserId ||
      room.host_session_id === sessionId
    );
  }, [room, authUserId, sessionId]);

  const currentVideoId = room?.current_video_id || "";
  const currentTitle = room?.current_title || "Nothing playing";
  const currentThumbnail = getYouTubeThumb(currentVideoId);

  const youtubeOpts = useMemo(
    () => ({
      width: "100%",
      height: "440",
      playerVars: {
        autoplay: 1,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
      },
    }),
    []
  );

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    playerVideoIdRef.current = playerVideoId;
  }, [playerVideoId]);

  useEffect(() => {
    playerReadyRef.current = playerReady;
  }, [playerReady]);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;
      setAuthUserId(session?.user?.id || null);
      setAuthUserEmail(session?.user?.email || "");
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUserId(session?.user?.id || null);
      setAuthUserEmail(session?.user?.email || "");
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
  if (!authUserId || !room?.id) return;

  const fetchVotes = async () => {
    const { data, error } = await supabase
      .from("room_queue_votes")
      .select("queue_item_id")
      .eq("user_id", authUserId);

    if (error) {
      console.error("fetchVotes error:", error);
      return;
    }

    setUserVotes((data || []).map((v) => v.queue_item_id));
  };

  fetchVotes();
}, [authUserId, room?.id]);
  const copyRoomLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert("Room link copied!");
    } catch {
      alert("Could not copy link. Copy it manually.");
    }
  }, []);

  const releaseRemoteActionLockSoon = useCallback(() => {
    window.setTimeout(() => {
      remoteActionLockRef.current = false;
    }, REMOTE_ACTION_LOCK_MS);
  }, []);

  const getPlayerTime = useCallback(() => {
    try {
      return safeNum(playerRef.current?.getCurrentTime?.(), 0);
    } catch {
      return 0;
    }
  }, []);

  const getPlayerState = useCallback(() => {
    try {
      return playerRef.current?.getPlayerState?.();
    } catch {
      return -1;
    }
  }, []);

  const updateRoomPlaybackState = useCallback(
    async (patch) => {
      if (!roomCode) return;

      const nextRoom = roomRef.current
        ? {
            ...roomRef.current,
            ...patch,
            updated_at: new Date().toISOString(),
          }
        : null;

      if (nextRoom) {
        roomRef.current = nextRoom;
        setRoom(nextRoom);
      }

      const { error: updateError } = await supabase
        .from("rooms")
        .update({
          ...patch,
          updated_at: new Date().toISOString(),
        })
        .eq("code", roomCode);

      if (updateError) throw updateError;
    },
    [roomCode]
  );

  const fetchQueue = useCallback(async () => {
    if (!roomRef.current?.id) return [];

    const { data, error: fetchError } = await supabase
      .from("room_queue")
      .select("*")
      .eq("room_id", roomRef.current.id)
.order("votes", { ascending: false })
.order("position", { ascending: true });
    if (fetchError) {
      console.error("fetchQueue error:", fetchError);
      return [];
    }

    return data || [];
  }, []);

  const loadRoom = useCallback(async () => {
    if (!roomCode) return;

    setLoading(true);
    setError("");

    try {
      const { data, error: roomErr } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", roomCode)
        .maybeSingle();

      if (roomErr) throw roomErr;

      if (!data) {
        setRoom(null);
        setQueue([]);
        setError("Room not found.");
        return;
      }

      setRoom(data);
      roomRef.current = data;
      setPlayerVideoId(data.current_video_id || "");

      const queueData = await fetchQueue();
      setQueue(queueData);
      queueRef.current = queueData;
    } catch (err) {
      console.error("loadRoom error:", err);
      setError(err.message || "Failed to load room.");
    } finally {
      setLoading(false);
    }
  }, [fetchQueue, roomCode]);

  const ensureHostFields = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!activeRoom || !authUserId) return;

    const userOwnsRoom = activeRoom.owner_id === authUserId;
    if (!userOwnsRoom) return;

    const patch = {};
    let shouldUpdate = false;

    if (!activeRoom.host_user_id) {
      patch.host_user_id = authUserId;
      shouldUpdate = true;
    }

    if (!activeRoom.host_session_id) {
      patch.host_session_id = sessionId;
      shouldUpdate = true;
    }

    if (!shouldUpdate) return;

    const { error: hostError } = await supabase
      .from("rooms")
      .update(patch)
      .eq("code", roomCode);

    if (hostError) console.error("ensureHostFields error:", hostError);
  }, [authUserId, roomCode, sessionId]);

  const pushHostState = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!isHost || !playerRef.current || !activeRoom?.current_video_id) return;

    const playerState = getPlayerState();
    const isPlayingNow = playerState === 1;
    const currentTime = getPlayerTime();

    try {
      await updateRoomPlaybackState({
        current_video_id: activeRoom.current_video_id || "",
        current_title: activeRoom.current_title || "",
        is_playing: isPlayingNow,
        playback_time: currentTime,
        last_sync_at: new Date().toISOString(),
        host_session_id: sessionId,
        ...(authUserId ? { host_user_id: authUserId } : {}),
      });
    } catch (err) {
      console.error("pushHostState error:", err);
    }
  }, [
    authUserId,
    getPlayerState,
    getPlayerTime,
    isHost,
    sessionId,
    updateRoomPlaybackState,
  ]);

  const startHostSyncLoop = useCallback(() => {
    if (hostSyncIntervalRef.current) {
      clearInterval(hostSyncIntervalRef.current);
      hostSyncIntervalRef.current = null;
    }

    if (!isHost) return;

    hostSyncIntervalRef.current = window.setInterval(() => {
      pushHostState();
    }, SYNC_PUSH_INTERVAL_MS);
  }, [isHost, pushHostState]);

  const stopHostSyncLoop = useCallback(() => {
    if (hostSyncIntervalRef.current) {
      clearInterval(hostSyncIntervalRef.current);
      hostSyncIntervalRef.current = null;
    }
  }, []);

  const reconcileGuestToHost = useCallback(() => {
    const activeRoom = roomRef.current;
    if (isHost || !playerRef.current || !activeRoom?.current_video_id) return;

    const projectedTime = projectHostPlaybackTime(activeRoom);
    const localTime = getPlayerTime();
    const drift = Math.abs(projectedTime - localTime);

    const localState = getPlayerState();
    const localIsPlaying = localState === 1;
    const hostIsPlaying = !!activeRoom.is_playing;
    const roomVideoId = activeRoom.current_video_id || "";

    if (roomVideoId && roomVideoId !== playerVideoIdRef.current) {
      setPlayerVideoId(roomVideoId);
      return;
    }

    if (hostIsPlaying !== localIsPlaying) {
      remoteActionLockRef.current = true;

      if (hostIsPlaying) {
        playerRef.current.playVideo?.();
      } else {
        playerRef.current.pauseVideo?.();
      }

      releaseRemoteActionLockSoon();
    }

    if (drift > SEEK_THRESHOLD_SECONDS) {
      remoteActionLockRef.current = true;
      playerRef.current.seekTo?.(projectedTime, true);
      releaseRemoteActionLockSoon();
      return;
    }

    if (!hostIsPlaying && drift > PAUSED_SEEK_THRESHOLD_SECONDS) {
      remoteActionLockRef.current = true;
      playerRef.current.seekTo?.(projectedTime, true);
      releaseRemoteActionLockSoon();
    }
  }, [getPlayerState, getPlayerTime, isHost, releaseRemoteActionLockSoon]);

  const startGuestSyncLoop = useCallback(() => {
    if (guestSyncIntervalRef.current) {
      clearInterval(guestSyncIntervalRef.current);
      guestSyncIntervalRef.current = null;
    }

    if (isHost) return;

    guestSyncIntervalRef.current = window.setInterval(() => {
      reconcileGuestToHost();
    }, GUEST_RECONCILE_INTERVAL_MS);
  }, [isHost, reconcileGuestToHost]);

  const stopGuestSyncLoop = useCallback(() => {
    if (guestSyncIntervalRef.current) {
      clearInterval(guestSyncIntervalRef.current);
      guestSyncIntervalRef.current = null;
    }
  }, []);

  const renumberQueueInDb = useCallback(async (items) => {
    const normalized = normalizeQueuePositions(items);

    if (!normalized.length) return normalized;

    for (const [index, item] of normalized.entries()) {
      const { error } = await supabase
        .from("room_queue")
        .update({ position: 100000 + index })
        .eq("id", item.id);

      if (error) throw error;
    }

    for (const item of normalized) {
      const { error } = await supabase
        .from("room_queue")
        .update({ position: item.position })
        .eq("id", item.id);

      if (error) throw error;
    }

    return normalized;
  }, []);

  const playQueueItemNow = useCallback(
    async (item) => {
      if (!isHost || !item || advancingRef.current) return;

      advancingRef.current = true;
      setQueueBusyId(item.id);

      try {
        setPlayerVideoId(item.video_id);

        const optimisticRoomPatch = {
          current_video_id: item.video_id,
          current_title: item.title || "Untitled",
          is_playing: true,
          playback_time: 0,
          last_sync_at: new Date().toISOString(),
          host_session_id: sessionId,
          ...(authUserId ? { host_user_id: authUserId } : {}),
        };

        setRoom((prev) => (prev ? { ...prev, ...optimisticRoomPatch } : prev));
        roomRef.current = roomRef.current
          ? { ...roomRef.current, ...optimisticRoomPatch }
          : roomRef.current;

        await updateRoomPlaybackState(optimisticRoomPatch);

        const { error: deleteError } = await supabase
          .from("room_queue")
          .delete()
          .eq("id", item.id);

        if (deleteError) throw deleteError;

        const remaining = queueRef.current.filter((q) => q.id !== item.id);
        const normalized = await renumberQueueInDb(remaining);

        setQueue(normalized);
        queueRef.current = normalized;
      } catch (err) {
        console.error("playQueueItemNow error:", err);
        alert(err.message || "Failed to play queue item.");
      } finally {
        setQueueBusyId(null);
        advancingRef.current = false;
      }
    },
    [authUserId, isHost, renumberQueueInDb, sessionId, updateRoomPlaybackState]
  );

  const advanceToNextTrack = useCallback(async () => {
    if (!isHost || advancingRef.current) return;

    const currentQueue = queueRef.current || [];
    const next = currentQueue[0];

    if (!next) {
      try {
        await updateRoomPlaybackState({
          is_playing: false,
          playback_time: 0,
          last_sync_at: new Date().toISOString(),
        });
      } catch (err) {
        console.error("advanceToNextTrack error:", err);
      }
      return;
    }

    await playQueueItemNow(next);
  }, [isHost, playQueueItemNow, updateRoomPlaybackState]);

  const removeQueueItem = useCallback(
    async (itemId) => {
      if (!isHost || !itemId) return;

      setQueueBusyId(itemId);

      try {
        const currentQueue = queueRef.current || [];
        const filtered = currentQueue.filter((item) => item.id !== itemId);

        const { error: deleteError } = await supabase
          .from("room_queue")
          .delete()
          .eq("id", itemId);

        if (deleteError) throw deleteError;

        const normalized = await renumberQueueInDb(filtered);
        setQueue(normalized);
        queueRef.current = normalized;
      } catch (err) {
        console.error("removeQueueItem error:", err);
        alert(err.message || "Failed to remove queue item.");
      } finally {
        setQueueBusyId(null);
      }
    },
    [isHost, renumberQueueInDb]
  );

  const moveQueueItem = useCallback(
    async (item, direction) => {
      if (!isHost || !item) return;

      const currentQueue = [...(queueRef.current || [])];
      const currentIndex = currentQueue.findIndex((q) => q.id === item.id);
      if (currentIndex === -1) return;

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= currentQueue.length) return;

      const reordered = [...currentQueue];
      const [moved] = reordered.splice(currentIndex, 1);
      reordered.splice(targetIndex, 0, moved);

      const optimistic = normalizeQueuePositions(reordered);
      setQueue(optimistic);
      queueRef.current = optimistic;

      try {
        const normalized = await renumberQueueInDb(optimistic);
        setQueue(normalized);
        queueRef.current = normalized;
      } catch (err) {
        console.error("moveQueueItem error:", err);
        alert(err.message || "Failed to move queue item.");
        loadRoom();
      }
    },
    [isHost, loadRoom, renumberQueueInDb]
  );

  const upvoteQueueItem = useCallback(
  async (item) => {
    if (!item?.id) return;

    if (!authUserId) {
      alert("Sign in to upvote songs.");
      return;
    }

    try {
      // ✅ Prevent duplicate votes
      const { error: voteError } = await supabase
        .from("room_queue_votes")
        .insert([
          {
            queue_item_id: item.id,
            user_id: authUserId,
          },
        ]);

      if (voteError) {
        const message = String(voteError.message || "").toLowerCase();

        if (
          message.includes("duplicate") ||
          message.includes("unique") ||
          message.includes("already exists")
        ) {
          alert("You already upvoted this song.");
          return;
        }

        throw voteError;
      }
      setUserVotes((prev) =>
  prev.includes(item.id) ? prev : [...prev, item.id]
);
      // ✅ Only increment after successful vote insert
      const nextVotes = Number(item.votes || 0) + 1;

      const { error: updateError } = await supabase
        .from("room_queue")
        .update({ votes: nextVotes })
        .eq("id", item.id);

      if (updateError) throw updateError;
    } catch (err) {
      console.error("upvoteQueueItem error:", err);
      alert(err.message || "Failed to upvote.");
    }
  },
  [authUserId]
);

  const addVideoToQueue = useCallback(async () => {
    const videoId = extractYouTubeId(videoInput);

    if (!videoId) {
      alert("Paste a valid YouTube URL or video ID.");
      return;
    }

    if (!roomRef.current?.id) {
      alert("Room is not ready yet.");
      return;
    }

    try {
      const { data: existing, error: fetchError } = await supabase
        .from("room_queue")
        .select("position")
        .eq("room_id", roomRef.current.id)
        .order("position", { ascending: false })
        .limit(1);

      if (fetchError) throw fetchError;

      const highestPosition = existing?.[0]?.position || 0;
      const nextPosition = highestPosition + 1;
      const videoTitle = await getYouTubeTitle(videoId);

      const payload = {
        room_id: roomRef.current.id,
        video_id: videoId,
        title: videoTitle,
        added_by: authUserId || sessionId,
        added_by_name: authUserEmail || "Guest",
        position: nextPosition,
        votes: 0,
      };

      const { error: insertError } = await supabase
        .from("room_queue")
        .insert([payload]);

      if (insertError) throw insertError;

      setVideoInput("");
    } catch (err) {
      console.error("addVideoToQueue error:", err);
      alert(err.message || "Failed to add video.");
    }
  }, [authUserEmail, authUserId, sessionId, videoInput]);

  const handlePlayerReady = useCallback(
    (event) => {
      playerRef.current = event.target;
      setPlayerReady(true);

      if (isHost) event.target.unMute?.();
      else event.target.mute?.();

      const activeRoom = roomRef.current;
      if (!activeRoom) return;

      const roomVideoId = activeRoom.current_video_id || "";
      if (roomVideoId && roomVideoId !== playerVideoIdRef.current) {
        setPlayerVideoId(roomVideoId);
      }

      window.setTimeout(() => {
        const latestRoom = roomRef.current;
        if (!latestRoom || !playerRef.current) return;

        if (isHost) playerRef.current.unMute?.();
        else playerRef.current.mute?.();

        if (isHost) {
          const roomTime = safeNum(latestRoom.playback_time, 0);
          playerRef.current.seekTo?.(roomTime, true);

          if (latestRoom.is_playing) playerRef.current.playVideo?.();
          else playerRef.current.pauseVideo?.();
        } else {
          const projected = projectHostPlaybackTime(latestRoom);
          playerRef.current.seekTo?.(projected, true);

          if (latestRoom.is_playing) playerRef.current.playVideo?.();
          else playerRef.current.pauseVideo?.();
        }
      }, 250);
    },
    [isHost]
  );

  const handlePlayerStateChange = useCallback(
    async (event) => {
      const activeRoom = roomRef.current;
      if (!activeRoom || !playerRef.current) return;

      const ytState = event.data;

      if (!isHost) {
        if (remoteActionLockRef.current) return;

        if (ytState === 1 || ytState === 2) {
          reconcileGuestToHost();
        }

        return;
      }

      if (remoteActionLockRef.current) return;

      try {
        if (ytState === 1) {
          await updateRoomPlaybackState({
            is_playing: true,
            playback_time: getPlayerTime(),
            last_sync_at: new Date().toISOString(),
            host_session_id: sessionId,
            ...(authUserId ? { host_user_id: authUserId } : {}),
          });
        } else if (ytState === 2) {
          await updateRoomPlaybackState({
            is_playing: false,
            playback_time: getPlayerTime(),
            last_sync_at: new Date().toISOString(),
            host_session_id: sessionId,
            ...(authUserId ? { host_user_id: authUserId } : {}),
          });
        } else if (ytState === 0) {
          await advanceToNextTrack();
        }
      } catch (err) {
        console.error("handlePlayerStateChange error:", err);
      }
    },
    [
      advanceToNextTrack,
      authUserId,
      getPlayerTime,
      isHost,
      reconcileGuestToHost,
      sessionId,
      updateRoomPlaybackState,
    ]
  );

  const handleHostPlay = useCallback(() => {
    if (!isHost || !playerRef.current || !currentVideoId) return;
    playerRef.current.unMute?.();
    playerRef.current.playVideo?.();
  }, [currentVideoId, isHost]);

  const handleHostPause = useCallback(() => {
    if (!isHost || !playerRef.current || !currentVideoId) return;
    playerRef.current.pauseVideo?.();
  }, [currentVideoId, isHost]);

  const handleResync = useCallback(async () => {
    if (isHost) await pushHostState();
    else reconcileGuestToHost();
  }, [isHost, pushHostState, reconcileGuestToHost]);

  useEffect(() => {
    loadRoom();

    return () => {
      stopHostSyncLoop();
      stopGuestSyncLoop();
    };
  }, [loadRoom, stopGuestSyncLoop, stopHostSyncLoop]);

  useEffect(() => {
    if (!room || !authUserId) return;
    ensureHostFields();
  }, [ensureHostFields, room, authUserId]);

  useEffect(() => {
    if (!room) return;

    if (isHost) {
      startHostSyncLoop();
      stopGuestSyncLoop();
    } else {
      stopHostSyncLoop();
      startGuestSyncLoop();
    }

    return () => {
      stopHostSyncLoop();
      stopGuestSyncLoop();
    };
  }, [
    isHost,
    room,
    startGuestSyncLoop,
    startHostSyncLoop,
    stopGuestSyncLoop,
    stopHostSyncLoop,
  ]);

  useEffect(() => {
    if (!roomCode || !room?.id) return;

    const roomChannel = supabase
      .channel(`room-state-${roomCode}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
          filter: `code=eq.${roomCode}`,
        },
        (payload) => {
          const nextRoom = payload.new;
          if (!nextRoom) return;

          setRoom(nextRoom);
          roomRef.current = nextRoom;

          const nextVideoId = nextRoom.current_video_id || "";
          if (nextVideoId !== playerVideoIdRef.current) {
            setPlayerVideoId(nextVideoId);
          }
        }
      )
      .subscribe();

    const queueChannel = supabase
      .channel(`room-queue-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_queue",
          filter: `room_id=eq.${room.id}`,
        },
        async () => {
          const latest = await fetchQueue();
          setQueue(latest);
          queueRef.current = latest;
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(roomChannel);
      supabase.removeChannel(queueChannel);
    };
  }, [fetchQueue, room?.id, roomCode]);

  useEffect(() => {
    if (!playerRef.current) return;

    if (isHost) playerRef.current.unMute?.();
    else playerRef.current.mute?.();
  }, [isHost, playerVideoId]);

  useEffect(() => {
    if (!playerReadyRef.current || !playerRef.current) return;
    if (!room?.current_video_id) return;

    if (room.current_video_id !== playerVideoIdRef.current) {
      setPlayerVideoId(room.current_video_id);
      return;
    }

    if (!isHost) reconcileGuestToHost();
  }, [isHost, reconcileGuestToHost, room]);

  if (!roomCode) {
    return (
      <div style={styles.page}>
        <div style={styles.statusCard}>Missing room code.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.statusCard}>Loading room...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.page}>
        <div style={styles.statusCard}>{error}</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.layout}>
        <div style={styles.leftColumn}>
          <div style={styles.headerBlock}>
            <div style={styles.roomTitleRow}>
              <h1 style={styles.roomTitle}>Room: {roomCode}</h1>
              <button style={styles.copyButton} onClick={copyRoomLink}>
                Copy Link
              </button>
            </div>

            <p style={styles.roleText}>
              Your role: <strong>{isHost ? "HOST" : "GUEST"}</strong>
            </p>

            <p style={styles.subtleText}>
              {isHost
                ? "You control playback for everyone in the room."
                : "You are synced to the host. Guest audio is muted."}
            </p>
          </div>

          <div style={styles.nowPlayingCard}>
            <div style={styles.sectionHeading}>Now playing</div>

            <div style={styles.nowPlayingRow}>
              <img
                src={currentThumbnail}
                alt={currentTitle}
                style={styles.nowPlayingThumb}
              />

              <div style={styles.nowPlayingMeta}>
                <div style={styles.platformLabel}>YouTube</div>
                <div style={styles.nowPlayingTitle}>{currentTitle}</div>
                <div style={styles.elapsedText}>
                  {room?.is_playing ? "Playing" : "Paused"}
                </div>
              </div>
            </div>
          </div>

          <div style={styles.playerCard}>
            {playerVideoId ? (
              <YouTube
                key={playerVideoId}
                videoId={playerVideoId}
                opts={youtubeOpts}
                onReady={handlePlayerReady}
                onStateChange={handlePlayerStateChange}
              />
            ) : (
              <div style={styles.emptyPlayer}>
                Add a video to the queue, then press Play on a queue item.
              </div>
            )}
          </div>

          <div style={styles.controlsCard}>
            <div style={styles.controlsRow}>
              <button
                style={{
                  ...styles.primaryButton,
                  ...(!isHost || !playerVideoId ? styles.disabledButton : {}),
                }}
                onClick={handleHostPlay}
                disabled={!isHost || !playerVideoId}
              >
                Play
              </button>

              <button
                style={{
                  ...styles.primaryButton,
                  ...(!isHost || !playerVideoId ? styles.disabledButton : {}),
                }}
                onClick={handleHostPause}
                disabled={!isHost || !playerVideoId}
              >
                Pause
              </button>
                <div style={styles.controlsRow}>
  <button
    style={{
      ...styles.primaryButton,
      ...(!isHost || !playerVideoId ? styles.disabledButton : {}),
    }}
    onClick={handleHostPlay}
    disabled={!isHost || !playerVideoId}
  >
    Play
  </button>

  <button
    style={{
      ...styles.primaryButton,
      ...(!isHost || !playerVideoId ? styles.disabledButton : {}),
    }}
    onClick={handleHostPause}
    disabled={!isHost || !playerVideoId}
  >
    Pause
  </button>

  {/* 🔥 ADD THIS RIGHT HERE */}
  <button
    style={{
      ...styles.secondaryButton,
      ...(!isHost || queue.length === 0 ? styles.disabledButton : {}),
    }}
    onClick={advanceToNextTrack}
    disabled={!isHost || queue.length === 0}
  >
    Play Top Voted
  </button>

  <button style={styles.secondaryButton} onClick={handleResync}>
    {isHost ? "Broadcast Sync" : "Resync"}
  </button>
</div>
              <button style={styles.secondaryButton} onClick={handleResync}>
                {isHost ? "Broadcast Sync" : "Resync"}
              </button>
            </div>
          </div>

          <div style={styles.addCard}>
            <div style={styles.sectionHeading}>Add YouTube link</div>

            <div style={styles.addRow}>
              <input
                value={videoInput}
                onChange={(e) => setVideoInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addVideoToQueue();
                }}
                placeholder="Paste a YouTube URL or video ID"
                style={styles.input}
              />

              <button style={styles.addButton} onClick={addVideoToQueue}>
                Add
              </button>
            </div>
          </div>
        </div>

        <div style={styles.rightColumn}>
          <div style={styles.queuePanel}>
            <div style={styles.queueHeader}>Queue ({queue.length})</div>

            {queue.length === 0 ? (
              <div style={styles.emptyQueue}>Queue is empty.</div>
            ) : (
              queue.map((item, index) => {
                const busy = queueBusyId === item.id;

                return (
                  <div key={item.id} style={styles.queueItem}>
                    <div style={styles.queueItemTop}>
                      <img
                        src={getYouTubeThumb(item.video_id)}
                        alt={item.title}
                        style={styles.queueThumb}
                      />

                      <div style={styles.queueMeta}>
                        <div style={styles.queueItemTitle}>
                          {item.title || "Untitled"}
                        </div>

                        <div style={styles.queueSub}>
                          Added by{" "}
                          {item.added_by_name || item.added_by || "unknown"}
                        </div>

                        <div style={styles.queueSub}>
Rank: {index + 1}                        </div>

                        <div style={styles.voteText}>
                          👍 Votes: {item.votes || 0}
                        </div>
                      </div>
                    </div>

                    <div style={styles.queueActions}>
                      <button
  style={{
    ...styles.queueActionButton,
    ...(userVotes.includes(item.id) ? styles.disabledButton : {}),
  }}
  onClick={() => upvoteQueueItem(item)}
  disabled={userVotes.includes(item.id)}
>
  {userVotes.includes(item.id) ? "✅ Voted" : "👍 Upvote"}
</button>

                      <button
                        style={{
                          ...styles.queueActionButton,
                          ...(!isHost || busy ? styles.disabledButton : {}),
                        }}
                        onClick={() => playQueueItemNow(item)}
                        disabled={!isHost || busy}
                      >
                        Play
                      </button>

                      <button
                        style={{
                          ...styles.queueActionButton,
                          ...(!isHost || busy ? styles.disabledButton : {}),
                        }}
                        onClick={() => removeQueueItem(item.id)}
                        disabled={!isHost || busy}
                      >
                        Remove
                      </button>

                      <button
                        style={{
                          ...styles.iconButton,
                          ...(!isHost || index === 0 || busy
                            ? styles.disabledButton
                            : {}),
                        }}
                        onClick={() => moveQueueItem(item, "up")}
                        disabled={!isHost || index === 0 || busy}
                      >
                        ↑
                      </button>

                      <button
                        style={{
                          ...styles.iconButton,
                          ...(!isHost || index === queue.length - 1 || busy
                            ? styles.disabledButton
                            : {}),
                        }}
                        onClick={() => moveQueueItem(item, "down")}
                        disabled={!isHost || index === queue.length - 1 || busy}
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top left, #16357a 0%, #0a1b4d 35%, #031031 70%, #020816 100%)",
    padding: "30px",
    boxSizing: "border-box",
    color: "#0f172a",
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "1.45fr 0.95fr",
    gap: "28px",
    alignItems: "start",
    maxWidth: "1450px",
    margin: "0 auto",
  },
  leftColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  rightColumn: {
    display: "flex",
    flexDirection: "column",
  },
  headerBlock: {
    color: "white",
    padding: "8px 2px",
  },
  roomTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
  },
  roomTitle: {
    margin: 0,
    fontSize: "3rem",
    fontWeight: 900,
    lineHeight: 1,
  },
  copyButton: {
    border: "none",
    borderRadius: "14px",
    padding: "10px 14px",
    fontWeight: 900,
    fontSize: "0.9rem",
    cursor: "pointer",
    background: "white",
    color: "#111827",
  },
  roleText: {
    margin: "14px 0 6px",
    fontSize: "1.25rem",
    fontWeight: 600,
  },
  subtleText: {
    margin: 0,
    opacity: 0.9,
    fontSize: "1.05rem",
  },
  nowPlayingCard: {
    background: "rgba(255,255,255,0.97)",
    borderRadius: "28px",
    padding: "26px",
    boxShadow: "0 18px 40px rgba(0,0,0,0.2)",
  },
  sectionHeading: {
    fontSize: "1.35rem",
    fontWeight: 900,
    marginBottom: "18px",
    color: "#111827",
  },
  nowPlayingRow: {
    display: "flex",
    alignItems: "center",
    gap: "18px",
  },
  nowPlayingThumb: {
    width: "150px",
    height: "96px",
    objectFit: "cover",
    borderRadius: "18px",
    background: "#e5e7eb",
    flexShrink: 0,
  },
  nowPlayingMeta: {
    minWidth: 0,
  },
  platformLabel: {
    fontSize: "1rem",
    color: "#6b7280",
    fontWeight: 800,
    marginBottom: "8px",
  },
  nowPlayingTitle: {
    fontSize: "2.3rem",
    fontWeight: 900,
    lineHeight: 1.02,
    color: "#111827",
    wordBreak: "break-word",
  },
  elapsedText: {
    marginTop: "12px",
    color: "#6b7280",
    fontSize: "1.05rem",
    fontWeight: 600,
  },
  playerCard: {
    background: "rgba(255,255,255,0.97)",
    borderRadius: "28px",
    padding: "18px",
    boxShadow: "0 18px 40px rgba(0,0,0,0.2)",
    overflow: "hidden",
  },
  emptyPlayer: {
    minHeight: "440px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#6b7280",
    fontSize: "1.05rem",
    fontWeight: 600,
    textAlign: "center",
    padding: "20px",
  },
  controlsCard: {
    background: "rgba(255,255,255,0.97)",
    borderRadius: "24px",
    padding: "18px",
    boxShadow: "0 18px 40px rgba(0,0,0,0.2)",
  },
  controlsRow: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
  },
  primaryButton: {
    border: "none",
    borderRadius: "15px",
    padding: "13px 20px",
    fontWeight: 900,
    fontSize: "1rem",
    cursor: "pointer",
    background: "#111827",
    color: "white",
  },
  secondaryButton: {
    border: "none",
    borderRadius: "15px",
    padding: "13px 20px",
    fontWeight: 900,
    fontSize: "1rem",
    cursor: "pointer",
    background: "#e5e7eb",
    color: "#111827",
  },
  addCard: {
    background: "rgba(255,255,255,0.97)",
    borderRadius: "24px",
    padding: "20px",
    boxShadow: "0 18px 40px rgba(0,0,0,0.2)",
  },
  addRow: {
    display: "flex",
    gap: "12px",
  },
  input: {
    flex: 1,
    borderRadius: "15px",
    border: "1px solid #d1d5db",
    padding: "13px 15px",
    fontSize: "1rem",
    outline: "none",
    background: "white",
  },
  addButton: {
    border: "none",
    borderRadius: "15px",
    padding: "13px 20px",
    fontWeight: 900,
    fontSize: "1rem",
    cursor: "pointer",
    background: "#111827",
    color: "white",
  },
  queuePanel: {
    background: "rgba(255,255,255,0.97)",
    borderRadius: "30px",
    padding: "24px",
    boxShadow: "0 18px 40px rgba(0,0,0,0.2)",
  },
  queueHeader: {
    fontSize: "2.2rem",
    fontWeight: 900,
    marginBottom: "18px",
    color: "#111827",
  },
  emptyQueue: {
    color: "#6b7280",
    padding: "16px 4px",
    fontSize: "1rem",
    fontWeight: 600,
  },
  queueItem: {
    border: "1px solid #e5e7eb",
    borderRadius: "24px",
    padding: "16px",
    marginBottom: "16px",
    background: "#fff",
  },
  queueItemTop: {
    display: "flex",
    gap: "14px",
    alignItems: "flex-start",
  },
  queueThumb: {
    width: "132px",
    height: "76px",
    objectFit: "cover",
    borderRadius: "14px",
    background: "#e5e7eb",
    flexShrink: 0,
  },
  queueMeta: {
    flex: 1,
    minWidth: 0,
  },
  queueItemTitle: {
    fontSize: "1.2rem",
    fontWeight: 900,
    lineHeight: 1.25,
    marginBottom: "7px",
    color: "#111827",
    wordBreak: "break-word",
  },
  queueSub: {
    color: "#6b7280",
    fontSize: "0.98rem",
    marginBottom: "4px",
    fontWeight: 600,
  },
  voteText: {
    color: "#111827",
    fontSize: "1rem",
    fontWeight: 900,
    marginTop: "8px",
  },
  queueActions: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    marginTop: "15px",
    paddingLeft: "146px",
  },
  queueActionButton: {
    border: "none",
    borderRadius: "14px",
    padding: "12px 18px",
    fontWeight: 800,
    fontSize: "1rem",
    cursor: "pointer",
    background: "#f3f4f6",
    color: "#111827",
  },
  iconButton: {
    border: "none",
    borderRadius: "14px",
    padding: "12px 16px",
    fontWeight: 900,
    fontSize: "1rem",
    cursor: "pointer",
    background: "#f3f4f6",
    color: "#111827",
    minWidth: "52px",
  },
  disabledButton: {
    opacity: 0.45,
    cursor: "not-allowed",
  },
  statusCard: {
    background: "white",
    borderRadius: "22px",
    padding: "26px",
    boxShadow: "0 18px 40px rgba(0,0,0,0.2)",
    maxWidth: "540px",
  },
};