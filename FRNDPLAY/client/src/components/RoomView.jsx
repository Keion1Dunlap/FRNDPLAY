import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import { QRCodeCanvas } from "qrcode.react";
import { usePostHog } from "@posthog/react";
import YouTube from "react-youtube";
const responsiveCss = `
* {
  box-sizing: border-box;
}

html,
body,
#root {
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}

iframe {
  max-width: 100% !important;
}

@media (max-width: 900px) {
  .room-page {
    width: 100% !important;
    max-width: 100% !important;
    padding: 12px !important;
    overflow-x: hidden !important;
  }

  .room-layout {
  display: grid !important;
  grid-template-columns: 1fr !important;
    width: 100% !important;
    max-width: 100% !important;
    gap: 16px !important;
    margin: 0 !important;
  }

  .room-left,
  .room-right {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
  }

  .room-title {
    font-size: 1.8rem !important;
    line-height: 1.05 !important;
    word-break: break-word !important;
  }

  .player-card,
  .controls-card,
  .add-card,
  .queue-panel,
  .now-playing-card {
    width: 100% !important;
    max-width: 100% !important;
    padding: 14px !important;
    border-radius: 22px !important;
    overflow: hidden !important;
  }

  .now-playing-row {
    flex-direction: column !important;
    align-items: flex-start !important;
  }

  .now-playing-title {
    font-size: 1.35rem !important;
    line-height: 1.15 !important;
  }

  .now-playing-card img {
    width: 100% !important;
    height: auto !important;
    max-height: 180px !important;
  }

  .controls-card > div {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 8px !important;
  }

  .controls-card button {
    width: 100% !important;
    padding: 11px 8px !important;
    font-size: 0.9rem !important;
  }

  .add-card > div:last-child {
    flex-direction: column !important;
  }

  .add-card input,
  .add-card button {
    width: 100% !important;
  }

  .player-card iframe {
    width: 100% !important;
    height: 220px !important;
  }

  .queue-panel {
    margin: 0 !important;
  }

  .queue-header {
    font-size: 1.6rem !important;
    margin-bottom: 0 !important;
  }

  .queue-item {
    width: 100% !important;
    padding: 12px !important;
  }

  .queue-thumb {
    width: 100% !important;
    height: auto !important;
    max-height: 170px !important;
  }

  .queue-actions {
    padding-left: 0 !important;
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 8px !important;
    width: 100% !important;
  }

  .queue-actions button {
    width: 100% !important;
    min-width: 0 !important;
    padding: 10px 8px !important;
    font-size: 0.9rem !important;
  }
}
`;
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

export default function RoomView({ displayName = "" }) {
  const posthog = usePostHog();
  const roomCode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get("room") || "").trim().toUpperCase();
  }, []);

  const sessionId = useMemo(() => getSessionId(), []);
  
const endRoom = async () => {
  try {
    if (!isHost || !roomRef.current?.id) return;

    const confirmed = window.confirm("Are you sure you want to end this room?");
    if (!confirmed) return;

    await supabase
      .from("room_queue")
      .delete()
      .eq("room_id", roomRef.current.id);

    await supabase
  .from("rooms")
  .update({
    ended: true,
    current_video_id: "",
    current_title: "",
    is_playing: false,
    playback_time: 0,
    last_sync_at: new Date().toISOString(),
  })
  .eq("id", roomRef.current.id);
posthog.capture("room_ended", {
  room_code: roomCode,
});
    window.location.assign("/");
  } catch (err) {
    console.error("endRoom error:", err);
    alert("Failed to end room.");
  }
};
  const [room, setRoom] = useState(null);
  const [queue, setQueue] = useState([]);
  const [messages, setMessages] = useState([]);
const [chatInput, setChatInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [videoInput, setVideoInput] = useState("");
  const [queueBusyId, setQueueBusyId] = useState(null);
  const [songMemory, setSongMemory] = useState([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(-1);
const [songMemoryIndex, setSongMemoryIndex] = useState(-1);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerVideoId, setPlayerVideoId] = useState("");
  const [playerReloadKey, setPlayerReloadKey] = useState(0);
  const [authUserId, setAuthUserId] = useState(null);
  const [authUserEmail, setAuthUserEmail] = useState("");
  const [userVotes, setUserVotes] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
const [searchResults, setSearchResults] = useState([]);
const [searchLoading, setSearchLoading] = useState(false);

// ADD THIS
const [memberCount, setMemberCount] = useState(1);
  const playerRef = useRef(null);
  const hostSyncIntervalRef = useRef(null);
  const guestSyncIntervalRef = useRef(null);
  const remoteActionLockRef = useRef(false);
  const advancingRef = useRef(false);
  const roomRef = useRef(null);
  const queueRef = useRef([]);
  const playerVideoIdRef = useRef("");
  const playerReadyRef = useRef(false);
  const suppressPauseUntilRef = useRef(0);
const songMemoryRef = useRef([]);
const songMemoryIndexRef = useRef(-1);
const currentQueueIndexRef = useRef(-1);
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
  songMemoryRef.current = songMemory;
}, [songMemory]);
useEffect(() => {
  currentQueueIndexRef.current = currentQueueIndex;
}, [currentQueueIndex]);
useEffect(() => {
  songMemoryIndexRef.current = songMemoryIndex;
}, [songMemoryIndex]);
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
const leaveRoom = () => {
  window.location.assign("/");
};
const toggleSafeMode = async () => {
  if (!isHost || !room?.id) return;

  const nextValue = !room.safe_mode;

  const { error } = await supabase
    .from("rooms")
    .update({ safe_mode: nextValue })
    .eq("id", room.id);

  if (error) {
    console.error("toggleSafeMode error:", error);
    alert("Failed to update Safe Mode.");
    return;
  }

  setRoom((prev) =>
    prev ? { ...prev, safe_mode: nextValue } : prev
  );
  posthog.capture("safe_mode_toggled", {
  room_code: roomCode,
  enabled: nextValue,
});
};
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
.order("position", { ascending: true });    if (fetchError) {
      console.error("fetchQueue error:", fetchError);
      return [];
    }

    return data || [];
  }, []);
const refreshQueueNow = useCallback(async () => {
  const latest = await fetchQueue();

  const sorted = [...latest].sort((a, b) => {
    const voteDiff = (b.votes || 0) - (a.votes || 0);

    if (voteDiff !== 0) return voteDiff;

    return (a.position || 0) - (b.position || 0);
  });

  setQueue(sorted);
  queueRef.current = sorted;

  return sorted;
}, [fetchQueue]);

const checkRoomEnded = useCallback(async () => {
  if (!roomCode) return;

  const { data, error } = await supabase
    .from("rooms")
    .select("ended")
    .eq("code", roomCode)
    .maybeSingle();

  if (error) {
    console.error("checkRoomEnded error:", error);
    return;
  }

  if (data?.ended) {
    window.location.assign("/");
  }
}, [roomCode]);

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

posthog.capture("room_joined", {
  room_code: roomCode,
});

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
const rememberSong = useCallback((song) => {
  if (!song?.video_id) return -1;

  const cleanSong = {
    video_id: song.video_id,
    title: song.title || "Untitled",
  };

  const existingIndex = songMemoryRef.current.findIndex(
    (s) => s.video_id === cleanSong.video_id
  );

  if (existingIndex !== -1) {
    songMemoryIndexRef.current = existingIndex;
    setSongMemoryIndex(existingIndex);
    return existingIndex;
  }

  const nextMemory = [...songMemoryRef.current, cleanSong];
  const nextIndex = nextMemory.length - 1;

  songMemoryRef.current = nextMemory;
  songMemoryIndexRef.current = nextIndex;

  setSongMemory(nextMemory);
  setSongMemoryIndex(nextIndex);

  return nextIndex;
}, []);

const playQueueItemNow = useCallback(
  async (item) => {
    if (!isHost || !item || advancingRef.current) return;

    advancingRef.current = true;
    setQueueBusyId(item.id);
    suppressPauseUntilRef.current = Date.now() + 3000;

    try {
      const currentRoom = roomRef.current;
      const queueIndex = queueRef.current.findIndex(
        (q) => q.video_id === item.video_id
      );

      if (queueIndex !== -1) {
        currentQueueIndexRef.current = queueIndex;
        setCurrentQueueIndex(queueIndex);
      }
      if (currentRoom?.current_video_id) {
        rememberSong({
          video_id: currentRoom.current_video_id,
          title: currentRoom.current_title,
        });
      }

      rememberSong({
        video_id: item.video_id,
        title: item.title || "Untitled",
      });

      setPlayerVideoId(item.video_id);
      playerVideoIdRef.current = item.video_id;

      await updateRoomPlaybackState({
        current_video_id: item.video_id,
        current_title: item.title || "Untitled",
        is_playing: false,
        playback_time: 0,
        last_sync_at: new Date().toISOString(),
        host_session_id: sessionId,
        ...(authUserId ? { host_user_id: authUserId } : {}),
      });

    } catch (err) {
      console.error("playQueueItemNow error:", err);
      alert(err.message || "Failed to play queue item.");
    } finally {
      setQueueBusyId(null);
      advancingRef.current = false;
    }
  },
  [
    authUserId,
    isHost,
    refreshQueueNow,
    rememberSong,
    sessionId,
    updateRoomPlaybackState,
  ]
);

const advanceToNextTrack = useCallback(async () => {
  if (!isHost || advancingRef.current) return;

  const currentQueue = [...(queueRef.current || [])].sort((a, b) => {
    return (a.position || 0) - (b.position || 0);
  });

  if (currentQueue.length === 0) {
    alert("No songs in the queue.");
    return;
  }

  const currentVideoId =
    roomRef.current?.current_video_id || playerVideoIdRef.current || "";

  const currentIndex = currentQueue.findIndex(
    (item) => item.video_id === currentVideoId
  );

  const nextIndex = currentIndex === -1 ? 0 : currentIndex + 1;

  if (nextIndex >= currentQueue.length) {
    alert("You are at the last song.");
    return;
  }

  currentQueueIndexRef.current = nextIndex;
  setCurrentQueueIndex(nextIndex);

  await playQueueItemNow(currentQueue[nextIndex]);
}, [isHost, playQueueItemNow]);

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
const clearQueue = useCallback(async () => {
  if (!isHost || !roomRef.current?.id) return;

  const confirmed = window.confirm("Clear all songs from the queue?");
  if (!confirmed) return;

  try {
    const { error } = await supabase
      .from("room_queue")
      .delete()
      .eq("room_id", roomRef.current.id);

    if (error) throw error;

    setQueue([]);
    queueRef.current = [];

    await refreshQueueNow();
    posthog.capture("queue_cleared", {
  room_code: roomCode,
});
  } catch (err) {
    console.error("clearQueue error:", err);
    alert("Failed to clear queue.");
  }
}, [isHost, refreshQueueNow]);
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
      const latest = await fetchQueue();
setQueue(latest);
queueRef.current = latest;
posthog.capture("song_upvoted", {
  room_code: roomCode,
  song_id: item.id,
  title: item.title,
});
    } catch (err) {
      console.error("upvoteQueueItem error:", err);
      alert(err.message || "Failed to upvote.");
    }
  },
[authUserId, fetchQueue]);

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
    const videoTitle = await getYouTubeTitle(videoId);

    const payload = {
      room_id: roomRef.current.id,
      video_id: videoId,
      title: videoTitle,
      added_by: authUserId || sessionId,
      added_by_name: displayName.trim() || authUserEmail || "Guest",
      position: highestPosition + 1,
      votes: 0,
    };

    const { error: insertError } = await supabase
      .from("room_queue")
      .insert([payload]);

    if (insertError) throw insertError;

    await refreshQueueNow();
    setSearchResults([]);
    setSearchQuery("");
    setVideoInput("");

    posthog.capture("song_added", {
      room_code: roomCode,
      title: videoTitle,
    });

  } catch (err) {
    console.error("addVideoToQueue error:", err);
    alert(err.message || "Failed to add video.");
  }
}, [
  authUserEmail,
  authUserId,
  displayName,
  sessionId,
  videoInput,
  refreshQueueNow,
  posthog,
  roomCode,
]);
const handlePlayerReady = useCallback(
  (event) => {
    playerRef.current = event.target;
    setPlayerReady(true);

    const activeRoom = roomRef.current;
    if (!activeRoom) return;

    const roomVideoId = activeRoom.current_video_id || "";

    if (roomVideoId && roomVideoId !== playerVideoIdRef.current) {
      setPlayerVideoId(roomVideoId);
      playerVideoIdRef.current = roomVideoId;
    }

    window.setTimeout(() => {
      const latestRoom = roomRef.current;
      if (!latestRoom || !playerRef.current) return;

      const targetTime = isHost
        ? safeNum(latestRoom.playback_time, 0)
        : projectHostPlaybackTime(latestRoom);

      playerRef.current.seekTo?.(targetTime, true);

      if (latestRoom.is_playing) {
        suppressPauseUntilRef.current = Date.now() + 3000;
        playerRef.current.playVideo?.();

        if (isHost) {
          window.setTimeout(() => {
          }, 600);
        }
      } else {
        playerRef.current.pauseVideo?.();
      }
    }, 500);
  },
  [isHost]
);
const searchYouTube = useCallback(async () => {
  if (!searchQuery.trim()) {
    alert("Search for a song or video.");
    return;
  }

  const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;

  if (!apiKey) {
    alert("Missing YouTube API key.");
    return;
  }

  setSearchLoading(true);

  try {
   const params = new URLSearchParams({
  part: "snippet",
  q: searchQuery.trim(),
  type: "video",
  maxResults: "8",
  videoEmbeddable: "true",
  safeSearch: room?.safe_mode ? "strict" : "none",
  key: apiKey,
});

    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params.toString()}`
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error?.message || "YouTube search failed.");
    }

    setSearchResults(data.items || []);
  } catch (err) {
    console.error("searchYouTube error:", err);
    alert(err.message || "Failed to search YouTube.");
  } finally {
    setSearchLoading(false);
  }
}, [searchQuery, room?.safe_mode]);
const addSearchResultToQueue = useCallback(
  async (result) => {
    const videoId = result?.id?.videoId;
    const title = result?.snippet?.title;

    if (!videoId) {
      alert("Invalid YouTube result.");
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

      const payload = {
        room_id: roomRef.current.id,
        video_id: videoId,
        title: title || `YouTube Video (${videoId})`,
        added_by: authUserId || sessionId,
        added_by_name: displayName.trim() || authUserEmail || "Guest",
        position: highestPosition + 1,
        votes: 0,
      };

      const { error: insertError } = await supabase
        .from("room_queue")
        .insert([payload]);

      if (insertError) throw insertError;

      await refreshQueueNow();
      setSearchResults([]);
      setSearchQuery("");

      posthog.capture("song_added", {
        room_code: roomCode,
        title,
      });

    } catch (err) {
      console.error("addSearchResultToQueue error:", err);
      alert(err.message || "Failed to add video.");
    }
  },
  [
    authUserEmail,
    authUserId,
    displayName,
    sessionId,
    refreshQueueNow,
    posthog,
    roomCode,
  ]
);
const handlePlayerError = useCallback((event) => {
  console.error("YouTube player error:", event.data);

  

  updateRoomPlaybackState({
    is_playing: false,
    playback_time: 0,
    last_sync_at: new Date().toISOString(),
  }).catch((err) => {
    console.error("handlePlayerError update error:", err);
  });
}, [updateRoomPlaybackState]);
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
  if (Date.now() < suppressPauseUntilRef.current) return;

  await updateRoomPlaybackState({
    is_playing: false,
    playback_time: getPlayerTime(),
    last_sync_at: new Date().toISOString(),
    host_session_id: sessionId,
    ...(authUserId ? { host_user_id: authUserId } : {}),
  });
        } else if (ytState === 0) {
  return;
}
      } catch (err) {
        console.error("handlePlayerStateChange error:", err);
      }
    },
    [
  authUserId,
  getPlayerTime,
  isHost,
  reconcileGuestToHost,
  sessionId,
  updateRoomPlaybackState,
]
  );
  const sendChatMessage = useCallback(async () => {
  if (!chatInput.trim() || !roomRef.current?.id) return;

  const { error } = await supabase.from("room_messages").insert([
    {
      room_id: roomRef.current.id,
      sender_name: displayName.trim() || authUserEmail || "Guest",
      message: chatInput.trim(),
    },
  ]);

  if (error) {
    console.error("sendChatMessage error:", error);
    alert("Failed to send message.");
    return;
  }

  setChatInput("");
}, [chatInput, displayName, authUserEmail]);

const handleHostPlay = useCallback(async () => {
  if (!isHost) return;

  const currentQueue = [...(queueRef.current || [])];

  if (!roomRef.current?.current_video_id && currentQueue.length > 0) {
    await playQueueItemNow(currentQueue[0]);
    return;
  }

if (!roomRef.current?.current_video_id) return;

setPlayerReloadKey((prev) => prev + 1);

await updateRoomPlaybackState({
    is_playing: true,
    playback_time: 0,
    last_sync_at: new Date().toISOString(),
    host_session_id: sessionId,
    ...(authUserId ? { host_user_id: authUserId } : {}),
  });
}, [
  authUserId,
  isHost,
  playQueueItemNow,
  sessionId,
  updateRoomPlaybackState,
]);
const playPreviousSong = useCallback(async () => {
  if (!isHost || advancingRef.current) return;

  const currentQueue = [...(queueRef.current || [])].sort((a, b) => {
    return (a.position || 0) - (b.position || 0);
  });

  const currentVideoId =
    roomRef.current?.current_video_id || playerVideoIdRef.current || "";

  const currentIndex = currentQueue.findIndex(
    (item) => item.video_id === currentVideoId
  );

  const previousIndex = currentIndex - 1;

  if (previousIndex < 0) {
    alert("You are at the first song.");
    return;
  }

  await playQueueItemNow(currentQueue[previousIndex]);
}, [isHost, playQueueItemNow]);
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
  if (!room?.id) return;

  const interval = window.setInterval(() => {
    refreshQueueNow();
    checkRoomEnded();
  }, 2000);

  return () => window.clearInterval(interval);
}, [room?.id, refreshQueueNow, checkRoomEnded]);
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

if (nextRoom.ended) {
  window.location.assign("/");
  return;
}

setRoom(nextRoom);
roomRef.current = nextRoom;

          const nextVideoId = nextRoom.current_video_id || "";
          if (nextVideoId !== playerVideoIdRef.current) {
            setPlayerVideoId(nextVideoId);
          }
        }
      )
      .subscribe();
const presenceChannel = supabase.channel(`presence-${roomCode}`);

presenceChannel
  .on("presence", { event: "sync" }, () => {
    const state = presenceChannel.presenceState();
    const count = Object.keys(state).length;
    setMemberCount(count);
  })
  .subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await presenceChannel.track({
        online_at: new Date().toISOString(),
      });
    }
  });
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
  await refreshQueueNow();
}
)
.subscribe();

const messagesChannel = supabase
  .channel(`room-messages-${room.id}`)
  .on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "room_messages",
      filter: `room_id=eq.${room.id}`,
    },
    (payload) => {
      setMessages((prev) => [...prev, payload.new]);
    }
  )
  .subscribe();

    return () => {
  supabase.removeChannel(roomChannel);
  supabase.removeChannel(queueChannel);
  supabase.removeChannel(messagesChannel);
  supabase.removeChannel(presenceChannel);
};
}, [refreshQueueNow, room?.id, roomCode]);

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
<div className="room-page" style={styles.page}>
  <style>{responsiveCss}</style>        <div style={styles.statusCard}>Missing room code.</div>
      </div>
    );
  }

  if (loading) {
    return (
  <div className="room-page" style={styles.page}>
    <style>{responsiveCss}</style>
        <div style={styles.statusCard}>Loading room...</div>
      </div>
    );
  }

 if (error) {
  return (
    <div className="room-page" style={styles.page}>
      <style>{responsiveCss}</style>
      <div style={styles.statusCard}>{error}</div>
    </div>
  );
}

return (
  <div className="room-page" style={styles.page}>
      <style>{responsiveCss}</style>

      <div className="room-layout" style={styles.layout}>
        <div className="room-left" style={styles.leftColumn}>
          <div style={styles.headerBlock}>
            <div style={styles.roomTitleRow}>
  <h1 className="room-title" style={styles.roomTitle}>
    Room: {roomCode}
  </h1>

  <button style={styles.copyButton} onClick={copyRoomLink}>
    Copy Link
  </button>

  <button
  style={styles.shareButton}
  onClick={async () => {
    const url = `${window.location.origin}/?room=${roomCode}`;
    const shareText = `Join my FRNDPLAY room\n\nClick here to join: ${url}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join my FRNDPLAY room",
          text: shareText,
          url,
        });
      } catch {}
    } else {
      await navigator.clipboard.writeText(shareText);
      alert("Invite link copied!");
    }
  }}
>
  Share Room
</button>

<div style={styles.qrCard}>
  <QRCodeCanvas
    value={`${window.location.origin}/?room=${roomCode}`}
    size={140}
  />

  <div style={styles.qrText}>
    Scan to join this room
  </div>
</div>
              <button style={styles.leaveButton} onClick={leaveRoom}>
  Leave Room
</button>
              {isHost && (
  <button
style={{
  background: "#ef4444",
  color: "#fff",
  border: "none",
  padding: "10px 14px",
  borderRadius: 10,
  fontWeight: 700
}}    onClick={endRoom}
  >
    End Room
  </button>
)}
            </div>

            <p style={styles.roleText}>
              Your role: <strong>{isHost ? "HOST" : "GUEST"}</strong>
            </p>
            <p style={styles.roleText}>
  Live Members: <strong>{memberCount}</strong>
</p>
{isHost && (
  <button
    style={{
      ...styles.secondaryButton,
      marginTop: "10px",
      background: room?.safe_mode ? "#dcfce7" : "#e5e7eb",
      color: room?.safe_mode ? "#166534" : "#111827",
    }}
    onClick={toggleSafeMode}
  >
    Safe Mode: {room?.safe_mode ? "ON" : "OFF"}
  </button>
)}
            <p style={styles.subtleText}>
              {isHost
                ? "You control playback for everyone in the room."
                : "You are synced to the host. Guest audio is muted."}
            </p>
          </div>

<div className="now-playing-card" style={styles.nowPlayingCard}>            <div style={styles.sectionHeading}>Now playing</div>

<div className="now-playing-row" style={styles.nowPlayingRow}>              <img
                src={currentThumbnail}
                alt={currentTitle}
                style={styles.nowPlayingThumb}
              />

              <div style={styles.nowPlayingMeta}>
                <div style={styles.platformLabel}>YouTube</div>
<div className="now-playing-title" style={styles.nowPlayingTitle}>
  {currentTitle}
</div>                <div style={styles.elapsedText}>
                  {room?.is_playing ? "Playing" : "Paused"}
                </div>
              </div>
            </div>
          </div>

<div className="player-card" style={styles.playerCard}>
  {isHost && playerVideoId ? (
    <YouTube
  key={playerVideoId}
  videoId={playerVideoId}
  opts={youtubeOpts}
  onReady={handlePlayerReady}
  onStateChange={handlePlayerStateChange}
  onError={handlePlayerError}
/>
  ) : isHost ? (
    <div style={styles.emptyPlayer}>
      Add a video to the queue, then press Play on a queue item.
    </div>
  ) : currentVideoId ? (
  <div style={styles.guestPlayerPreview}>
    <img
      src={currentThumbnail}
      alt={currentTitle}
      style={styles.guestPlayerThumb}
    />
    <div style={styles.guestPlayerOverlay}>
      <div style={styles.guestPlayerLabel}>Now playing</div>
      <div style={styles.guestPlayerTitle}>{currentTitle}</div>
      <div style={styles.guestPlayerSub}>
        Playback is controlled by the host
      </div>
    </div>
  </div>
) : (
  <div style={styles.emptyPlayer}>
    Guest mode: playback is controlled by the host.
  </div>
)}
</div>

<div className="controls-card" style={styles.controlsCard}>
  <div style={styles.controlsRow}>
    <button
      style={{
        ...styles.primaryButton,
        opacity:
          !isHost || (!playerVideoId && queue.length === 0) ? 0.45 : 1,
        cursor:
          !isHost || (!playerVideoId && queue.length === 0)
            ? "not-allowed"
            : "pointer",
      }}
      onClick={handleHostPlay}
      disabled={!isHost || (!playerVideoId && queue.length === 0)}
    >
      Play
    </button>

    <button
      style={{
        ...styles.primaryButton,
        opacity: !isHost || !playerVideoId ? 0.45 : 1,
        cursor: !isHost || !playerVideoId ? "not-allowed" : "pointer",
      }}
      onClick={handleHostPause}
      disabled={!isHost || !playerVideoId}
    >
      Pause
    </button>

    <button
      style={{
        ...styles.secondaryButton,
        ...(!isHost || queue.length === 0 ? styles.disabledButton : {}),
      }}
      onClick={advanceToNextTrack}
      disabled={!isHost || queue.length === 0}
    >
      Skip Song
    </button>

    <button
      style={{
        ...styles.secondaryButton,
        ...(!isHost || queue.length === 0
          ? styles.disabledButton
          : {}),
      }}
      onClick={playPreviousSong}
      disabled={!isHost || queue.length === 0}
    >
      Previous Song
    </button>

    <button style={styles.secondaryButton} onClick={handleResync}>
      {isHost ? "Broadcast Sync" : "Resync"}
    </button>
  </div>
</div>
<div style={styles.instructionsCard}>
  <div style={styles.instructionsTitle}>How this room works</div>
  <div style={styles.instructionsList}>
    <span>1. Search for a song</span>
    <span>2. Add it to the queue</span>
    <span>3. Upvote songs you want next</span>
    <span>4. Host controls playback</span>
  </div>
</div>
<div className="add-card" style={styles.addCard}>
  <div style={styles.sectionHeading}>Search YouTube</div>

  <div style={styles.addRow}>
    <input
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") searchYouTube();
      }}
      placeholder="Search for a song or video"
style={styles.searchInput}    />

    <button style={styles.addButton} onClick={searchYouTube}>
      {searchLoading ? "Searching..." : "Search"}
    </button>
  </div>

  {searchResults.length > 0 && (
    <div style={styles.searchResults}>
      {searchResults.map((result) => {
        const videoId = result?.id?.videoId;
        const title = result?.snippet?.title;
        const thumb = result?.snippet?.thumbnails?.medium?.url;

        return (
<div
  key={videoId || title}
  style={styles.searchResultItem}
>
  <img
  src={getYouTubeThumb(videoId)}
  alt={title}
  style={styles.searchThumb}
/>

<div style={styles.searchResultMeta}>
  <div style={styles.searchResultTitle}>
    {title}
  </div>

  <div style={styles.searchResultChannel}>
    {result?.snippet?.channelTitle}
  </div>
</div>

<button
  style={styles.addButton}
  onClick={() => addSearchResultToQueue(result)}
>
    Add
  </button>
</div>
        );
      })}
    </div>
  )}
</div>
        </div>

        <div className="room-right" style={styles.rightColumn}>
  <div className="queue-panel" style={styles.queuePanel}>
    <div style={styles.queueHeaderRow}>
<div className="queue-header" style={styles.queueHeader}>    Queue ({queue.length})
  </div>

  <button
    style={{
      ...styles.clearQueueButton,
      ...(!isHost || queue.length === 0 ? styles.disabledButton : {}),
    }}
    onClick={clearQueue}
    disabled={!isHost || queue.length === 0}
  >
    Clear Queue
  </button>
</div>
            {queue.length === 0 ? (
              <div style={styles.emptyQueue}>Queue is empty.</div>
            ) : (
              queue.map((item, index) => {
                const busy = queueBusyId === item.id;

                return (
<div key={item.id} className="queue-item" style={styles.queueItem}>                    <div className="queue-item-top" style={styles.queueItemTop}>
                      <img
                        src={getYouTubeThumb(item.video_id)}
                        alt={item.title}
className="queue-thumb"
style={styles.queueThumb}                      />

                      <div style={styles.queueMeta}>
<div className="queue-title" style={styles.queueItemTitle}>                          {item.title || "Untitled"}
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

<div className="queue-actions" style={styles.queueActions}>                      <button
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
  searchResults: {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  marginTop: "16px",
},
guestPlayerPreview: {
  position: "relative",
  minHeight: "440px",
  borderRadius: "22px",
  overflow: "hidden",
  background: "#111827",
},

guestPlayerThumb: {
  width: "100%",
  height: "440px",
  objectFit: "cover",
  display: "block",
  filter: "brightness(0.55)",
},

guestPlayerOverlay: {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-end",
  padding: "24px",
  color: "white",
},

guestPlayerLabel: {
  fontSize: "0.95rem",
  fontWeight: 800,
  opacity: 0.85,
  marginBottom: "8px",
},

guestPlayerTitle: {
  fontSize: "2rem",
  fontWeight: 900,
  lineHeight: 1.1,
},

guestPlayerSub: {
  marginTop: "10px",
  fontSize: "1rem",
  fontWeight: 700,
  opacity: 0.85,
},

searchResultItem: {
  display: "grid",
  gridTemplateColumns: "96px minmax(0, 1fr) 96px",
  alignItems: "center",
  gap: "12px",
  width: "100%",
  padding: "12px",
  borderRadius: "16px",
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
},

searchThumb: {
  width: "96px",
  height: "54px",
  borderRadius: "10px",
  objectFit: "cover",
  flexShrink: 0,
},

searchMeta: {
  flex: 1,
  minWidth: 0,
},

searchTitle: {
  fontWeight: 900,
color: "#111827",
  lineHeight: 1.2,
  wordBreak: "break-word",
  width: "100%",
minWidth: 0,
},

searchChannel: {
  marginTop: "4px",
  color: "#6b7280",
  fontSize: "0.9rem",
  fontWeight: 600,
},
  endRoomButton: {
  border: "none",
  borderRadius: "14px",
  padding: "10px 14px",
  fontWeight: 900,
  fontSize: "0.9rem",
  cursor: "pointer",
  background: "#dc2626",
  color: "white",
},
  queueHeaderRow: {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "16px",
  gap: "10px",
  flexWrap: "wrap",
},

clearQueueButton: {
  border: "none",
  borderRadius: "12px",
  padding: "10px 14px",
  fontWeight: 800,
  fontSize: "0.9rem",
  cursor: "pointer",
  background: "#fee2e2",
  color: "#991b1b",
},
  page: {
  minHeight: "100vh",
  width: "100%",
overflowX: "hidden",
  background:
    "radial-gradient(circle at top left, #16357a 0%, #0a1b4d 35%, #031031 70%, #020816 100%)",
  padding: "30px",
  boxSizing: "border-box",
  color: "#0f172a",
},

layout: {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: "20px",
  alignItems: "start",
  width: "100%",
  maxWidth: "1100px",
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
  width: "100%",
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

leaveButton: {
  border: "none",
  borderRadius: "14px",
  padding: "10px 14px",
  fontWeight: 900,
  fontSize: "0.9rem",
  cursor: "pointer",
  background: "#e5e7eb",
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
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 180px",
  gap: "12px",
  alignItems: "center",
  width: "100%",
},
shareButton: {
  width: "100%",
  padding: "12px",
  borderRadius: "12px",
  border: "none",
  background: "#111827",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
},
qrCard: {
  background: "white",
  padding: "14px",
  borderRadius: "18px",
  display: "flex",
  alignItems: "center",
  gap: "14px",
  width: "fit-content",
},

qrText: {
  color: "#111827",
  fontWeight: 900,
  fontSize: "0.95rem",
},
instructionsCard: {
  background: "rgba(255,255,255,0.97)",
  borderRadius: "22px",
  padding: "18px",
  boxShadow: "0 18px 40px rgba(0,0,0,0.2)",
},

instructionsTitle: {
  color: "#111827",
  fontSize: "1.15rem",
  fontWeight: 900,
  marginBottom: "10px",
},

instructionsList: {
  display: "grid",
  gap: "8px",
  color: "#4b5563",
  fontWeight: 700,
},
  searchInput: {
  flex: 1,
  minWidth: 0,
  width: "100%",
  height: "56px",
  borderRadius: "18px",
  border: "1px solid #d1d5db",
  padding: "0 16px",
  fontSize: "16px",
  fontWeight: 700,
  color: "#111827",
  background: "#ffffff",
  caretColor: "#111827",
  WebkitTextFillColor: "#111827",
  outline: "none",
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
  width: "100%",
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
  width: "100%",
  padding: "14px",
  borderRadius: "18px",
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
},
  queueItemTop: {
  display: "grid",
  gridTemplateColumns: "132px minmax(0, 1fr)",
  gap: "14px",
  alignItems: "start",
  width: "100%",
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
  overflowWrap: "break-word",
  wordBreak: "normal",
},
  queueItemTitle: {
  fontSize: "1rem",
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
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: "8px",
  marginTop: "12px",
  paddingLeft: 0,
  width: "100%",
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


// 🔥 ADD THIS RIGHT HERE
mobileNotice: {
  display: "none",
},

};