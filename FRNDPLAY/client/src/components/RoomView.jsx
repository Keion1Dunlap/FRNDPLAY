import { searchYouTubeSongs } from "../lib/youtube";
import AutoQueueControls from "./AutoQueueControls";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import { QRCodeCanvas } from "qrcode.react";
import { usePostHog } from "posthog-js/react";
import YouTube from "react-youtube";
import {
  savePlayedSong,
  generateSongFromHistory,
} from "../lib/playbackHelpers";
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
  border-radius: 18px;
}

.queue-title,
.now-playing-title,
.search-result-title {
  overflow-wrap: anywhere;
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

  .player-card iframe {
    width: 100% !important;
    height: 220px !important;
  }

  .controls-card > div {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 8px !important;
  }

  .controls-card button {
    width: 100% !important;
    min-height: 44px !important;
    padding: 11px 8px !important;
    font-size: 0.88rem !important;
  }

  .add-card input,
  .add-card button {
    width: 100% !important;
  }

  .queue-header {
    font-size: 1.6rem !important;
    margin-bottom: 0 !important;
  }
  .queue-item {
  display: flex !important;
  flex-direction: column !important;
  gap: 12px !important;
  width: 100% !important;
  padding: 12px !important;
  overflow: hidden !important;
}

.queue-item-top {
  display: grid !important;
  grid-template-columns: 82px minmax(0, 1fr) !important;
  gap: 12px !important;
  align-items: center !important;
  width: 100% !important;
  min-width: 0 !important;
}

.queue-thumb {
  width: 82px !important;
  height: 62px !important;
  max-height: 62px !important;
  object-fit: cover !important;
  border-radius: 12px !important;
}

.queue-title {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  display: -webkit-box !important;
  -webkit-line-clamp: 2 !important;
  -webkit-box-orient: vertical !important;
  line-height: 1.2 !important;
  font-size: 0.95rem !important;
}

.queue-actions {
  display: grid !important;
  grid-template-columns: 1fr 1fr !important;
  gap: 8px !important;
  width: 100% !important;
  padding-left: 0 !important;
}

.queue-actions button {
  width: 100% !important;
  min-width: 0 !important;
  min-height: 42px !important;
  padding: 10px 8px !important;
  font-size: 0.84rem !important;
  border-radius: 12px !important;
}

  .search-result-item {
    grid-template-columns: 72px minmax(0, 1fr) !important;
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
function buildAutoQueueQuery({ currentTitle, songMemory = [] }) {
  function isBadAutoQueueResult(song) {
  const title = String(song?.title || "").toLowerCase();

  const blockedTerms = [
    "mix",
    "dj mix",
    "remix club",
    "playlist",
    "top songs",
    "best songs",
    "mashup",
    "megamix",
    "compilation",
    "full album",
    "album mix",
    "hour",
    "1 hour",
    "2 hour",
    "nonstop",
    "live set",
    "radio edit",
    "clean mix",
    "party mix",
    "dance mix",
    "club mix",
  ];

  return blockedTerms.some((term) => title.includes(term));
}
  const cleanTitle = (title) =>
    String(title || "")
      .replace(/\(official.*?\)/gi, "")
      .replace(/\[official.*?\]/gi, "")
      .replace(/\bHD\b/gi, "")
      .replace(/\blyrics?\b/gi, "")
      .replace(/\bvideo\b/gi, "")
      .replace(/\baudio\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

  const playedTitles = songMemory
    .map((song) => cleanTitle(song?.title))
    .filter(Boolean)
    .slice(-3);

  const baseTitle = cleanTitle(currentTitle);

  const seeds = [...playedTitles, baseTitle]
    .filter(Boolean)
    .filter((title, index, arr) => arr.indexOf(title) === index)
    .slice(-3);

  if (seeds.length === 0) {
    return "popular party songs";
  }

  if (seeds.length === 1) {
    return `songs similar to ${seeds[0]}`;
  }

  return `songs similar to ${seeds.join(" and ")}`;
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
    window.location.assign("/app");
  } catch (err) {
    console.error("endRoom error:", err);
    alert("Failed to end room.");
  }
};
  const [room, setRoom] = useState(null);
  const [queue, setQueue] = useState([]);
  const [messages, setMessages] = useState([]);
const [chatInput, setChatInput] = useState("");
const [autoQueueEnabled, setAutoQueueEnabled] = useState(false);
const [autoQueueVibe, setAutoQueueVibe] = useState("rap");
const [isAutoQueuing, setIsAutoQueuing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [videoInput, setVideoInput] = useState("");
  const [queueBusyId, setQueueBusyId] = useState(null);
  const [songMemory, setSongMemory] = useState([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(-1);
  const [playerReady, setPlayerReady] = useState(false);
const [songMemoryIndex, setSongMemoryIndex] = useState(-1);
  const [playerVideoId, setPlayerVideoId] = useState("");
  const [authUserId, setAuthUserId] = useState(null);
  const [authUserEmail, setAuthUserEmail] = useState("");
  const [userVotes, setUserVotes] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
const [searchResults, setSearchResults] = useState([]);
const [searchLoading, setSearchLoading] = useState(false);

useEffect(() => {
  if (!searchQuery.trim()) {
    setSearchResults([]);
    return;
  }

  const timer = setTimeout(() => {
    searchYouTube();
  }, 500); // waits 500ms after user stops typing

  return () => clearTimeout(timer);
}, [searchQuery]);
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
  const pendingMobilePlayRef = useRef("");
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
  const hostPlayerVideoId =
  playerVideoId || (isHost && queue.length > 0 ? queue[0]?.video_id : "");
  useEffect(() => {
  if (!isHost) return;
  if (!autoQueueEnabled) return;
  if (isAutoQueuing) return;
  if (queue.length >= 2) return;
  autoFillQueue();
}, [isHost, autoQueueEnabled, queue.length, currentTitle]);async function autoFillQueue() {
  if (!isHost || !room?.id || isAutoQueuing) return;

  setIsAutoQueuing(true);

  try {
    const currentRoom = roomRef.current;

    const recommendationQuery = buildAutoQueueQuery({
      currentTitle: currentRoom?.current_title || "",
      songMemory: songMemoryRef.current || [],
    });

    const results = await searchYouTubeSongs(recommendationQuery, 8);

    if (!results.length) return;

    const existingIds = new Set([
      ...queue.map((q) => q.video_id),
      currentRoom?.current_video_id,
      ...(songMemoryRef.current || []).map((song) => song.video_id),
    ]);

    const toAdd = results
  .filter(
    (song) =>
      song?.video_id &&
      !existingIds.has(song.video_id) &&
      !isBadAutoQueueResult(song)
  )
  .slice(0, 3);

    if (!toAdd.length) return;

    const startPos =
      Math.max(0, ...queue.map((q) => Number(q.position || 0))) + 1;

    const rows = toAdd.map((song, i) => ({
      room_id: room.id,
      video_id: song.video_id,
      title: song.title || "Untitled",
      added_by: authUserId || sessionId,
      added_by_name: displayName || authUserEmail || "Auto Queue",
      position: startPos + i,
      votes: 0,
      source: "auto_queue",
    }));

    const { error } = await supabase.from("room_queue").insert(rows);
    if (error) throw error;

    await refreshQueueNow();
  } catch (err) {
    console.error("autoFillQueue error:", err);
  } finally {
    setIsAutoQueuing(false);
  }
}

async function updateAutoQueueSetting(enabled) {
  if (!isHost || !room?.id) return;
  setAutoQueueEnabled(enabled);
  await supabase.from("rooms").update({ auto_queue_enabled: enabled }).eq("id", room.id);
}

async function updateAutoQueueVibe(vibe) {
  if (!isHost || !room?.id) return;
  setAutoQueueVibe(vibe);
  await supabase.from("rooms").update({ auto_queue_vibe: vibe }).eq("id", room.id);
}

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
window.location.assign("/app");
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
window.location.assign("/app");
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
setAutoQueueEnabled(Boolean(data.auto_queue_enabled));
setAutoQueueVibe(data.auto_queue_vibe || "rap");

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

const startHostVideoNow = useCallback((videoId) => {
  if (!videoId) return;

  pendingMobilePlayRef.current = videoId;
  suppressPauseUntilRef.current = Date.now() + 5000;

  const player = playerRef.current;

  if (!player) {
    console.log("Player not ready yet. Pending mobile play saved:", videoId);
    return;
  }

  try {
    player.loadVideoById({
      videoId,
      startSeconds: 0,
    });

    player.playVideo?.();

    window.setTimeout(() => {
      try {
        playerRef.current?.playVideo?.();
      } catch (err) {
        console.error("startHostVideoNow retry error:", err);
      }
    }, 250);

    window.setTimeout(() => {
      try {
        playerRef.current?.playVideo?.();
      } catch (err) {
        console.error("startHostVideoNow second retry error:", err);
      }
    }, 900);
  } catch (err) {
    console.error("startHostVideoNow error:", err);
  }
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

// Important: start playback immediately inside the user tap event
startHostVideoNow(item.video_id);

await updateRoomPlaybackState({
  current_video_id: item.video_id,
  current_title: item.title || "Untitled",
  is_playing: true,
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
    startHostVideoNow,
    updateRoomPlaybackState,
  ]
);
const playNextSong = useCallback(async () => {
  if (!isHost || advancingRef.current || !roomRef.current?.id) return;

  advancingRef.current = true;
  suppressPauseUntilRef.current = Date.now() + 3000;

  try {
    const currentRoom = roomRef.current;
    const currentQueue = [...(queueRef.current || [])].sort((a, b) => {
      const voteDiff = (b.votes || 0) - (a.votes || 0);
      if (voteDiff !== 0) return voteDiff;
      return (a.position || 0) - (b.position || 0);
    });

    let nextSong = null;
    let shouldRemoveFromQueue = false;

    if (currentQueue.length > 0) {
      nextSong = currentQueue[0];
      shouldRemoveFromQueue = true;
    } else if (autoQueueEnabled) {
  const recommendationQuery = buildAutoQueueQuery({
    currentTitle: currentRoom?.current_title || "",
    songMemory: songMemoryRef.current || [],
  });

  const results = await searchYouTubeSongs(recommendationQuery, 8);

  const existingIds = new Set([
    currentRoom?.current_video_id,
    ...(songMemoryRef.current || []).map((song) => song.video_id),
  ]);

  const generatedSong = results.find(
  (song) =>
    song?.video_id &&
    !existingIds.has(song.video_id) &&
    !isBadAutoQueueResult(song)
);

  if (generatedSong?.video_id) {
    nextSong = {
      video_id: generatedSong.video_id,
      title: generatedSong.title || "Untitled",
      source: "auto_queue",
    };
  }
}

    if (!nextSong?.video_id) {
      await updateRoomPlaybackState({
        is_playing: false,
        playback_time: 0,
        last_sync_at: new Date().toISOString(),
      });

      return;
    }

    if (currentRoom.current_video_id) {
      await savePlayedSong({
        roomId: currentRoom.id,
        song: {
          video_id: currentRoom.current_video_id,
          title: currentRoom.current_title || "Untitled",
          source: "played",
        },
      });

      rememberSong({
        video_id: currentRoom.current_video_id,
        title: currentRoom.current_title || "Untitled",
      });
    }

    rememberSong({
      video_id: nextSong.video_id,
      title: nextSong.title || "Untitled",
    });

    setPlayerVideoId(nextSong.video_id);
    playerVideoIdRef.current = nextSong.video_id;

    await updateRoomPlaybackState({
      current_video_id: nextSong.video_id,
      current_title: nextSong.title || "Untitled",
      is_playing: true,
      playback_time: 0,
      last_sync_at: new Date().toISOString(),
      host_session_id: sessionId,
      ...(authUserId ? { host_user_id: authUserId } : {}),
    });

    if (shouldRemoveFromQueue && nextSong.id) {
      const { error: deleteError } = await supabase
        .from("room_queue")
        .delete()
        .eq("id", nextSong.id);

      if (deleteError) {
        console.error("playNextSong delete queue item error:", deleteError);
      }

      await refreshQueueNow();
    }

    setTimeout(() => {
      try {
        playerRef.current?.playVideo?.();
      } catch (err) {
        console.error("playNextSong playVideo error:", err);
      }
    }, 800);
  } catch (err) {
    console.error("playNextSong error:", err);
  } finally {
    advancingRef.current = false;
  }
}, [
  authUserId,
  autoQueueEnabled,
  isHost,
  refreshQueueNow,
  rememberSong,
  sessionId,
  updateRoomPlaybackState,
]);
const advanceToNextTrack = useCallback(async () => {
  await playNextSong();
}, [playNextSong]); 

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

      const pendingVideoId = pendingMobilePlayRef.current;

      if (pendingVideoId && pendingVideoId === latestRoom.current_video_id) {
        suppressPauseUntilRef.current = Date.now() + 3500;
        playerRef.current.loadVideoById?.({ videoId: pendingVideoId, startSeconds: 0 });

        window.setTimeout(() => {
          try {
            playerRef.current?.playVideo?.();
            pendingMobilePlayRef.current = "";
          } catch (err) {
            console.error("handlePlayerReady pending play error:", err);
          }
        }, 250);
      } else if (latestRoom.is_playing) {
        suppressPauseUntilRef.current = Date.now() + 3000;
        playerRef.current.playVideo?.();
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
          pendingMobilePlayRef.current = "";

          await updateRoomPlaybackState({
            is_playing: true,
            playback_time: getPlayerTime(),
            last_sync_at: new Date().toISOString(),
            host_session_id: sessionId,
            ...(authUserId ? { host_user_id: authUserId } : {}),
          });
        } else if (ytState === 5 && pendingMobilePlayRef.current) {
          suppressPauseUntilRef.current = Date.now() + 2500;
          playerRef.current?.playVideo?.();
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
  await playNextSong();
}
      } catch (err) {
        console.error("handlePlayerStateChange error:", err);
      }
    },
    [
  authUserId,
  getPlayerTime,
  isHost,
  playNextSong,
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

  if (!roomRef.current?.current_video_id) {
    if (currentQueue.length > 0) {
      await playQueueItemNow(currentQueue[0]);
      return;
    }

    if (autoQueueEnabled) {
      await playNextSong();
      return;
    }

    return;
  }

  try {
    suppressPauseUntilRef.current = Date.now() + 2500;

    playerRef.current?.playVideo?.();

    await updateRoomPlaybackState({
      is_playing: true,
      playback_time: getPlayerTime(),
      last_sync_at: new Date().toISOString(),
      host_session_id: sessionId,
      ...(authUserId ? { host_user_id: authUserId } : {}),
    });
  } catch (err) {
    console.error("handleHostPlay error:", err);
  }
}, [
  authUserId,
  autoQueueEnabled,
  getPlayerTime,
  isHost,
  playNextSong,
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
window.location.assign("/app");
  return;
}

setRoom(nextRoom);
roomRef.current = nextRoom;
setAutoQueueEnabled(Boolean(nextRoom.auto_queue_enabled));
setAutoQueueVibe(nextRoom.auto_queue_vibe || "rap");

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
    const url = `${window.location.origin}/app?room=${roomCode}`;
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
    value={`${window.location.origin}/app?room=${roomCode}`}
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
  {isHost && hostPlayerVideoId ? (
  <YouTube
    videoId={hostPlayerVideoId}
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
          !isHost || (!playerVideoId && queue.length === 0 && !autoQueueEnabled) ? 0.45 : 1,
        cursor:
          !isHost || (!playerVideoId && queue.length === 0 && !autoQueueEnabled)
            ? "not-allowed"
            : "pointer",
      }}
      onClick={handleHostPlay}
      disabled={!isHost || (!playerVideoId && queue.length === 0 && !autoQueueEnabled)}
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
...(!isHost || (!playerVideoId && queue.length === 0 && !autoQueueEnabled)
  ? styles.disabledButton
  : {}),      }}
      onClick={advanceToNextTrack}
      disabled={!isHost || (!playerVideoId && queue.length === 0 && !autoQueueEnabled)}
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
    placeholder="Search for a song or video"
    style={{ ...styles.searchInput, gridColumn: "1 / -1" }}
  />
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
  className="search-result-item"
  style={styles.searchResultItem}
>
  <img
  src={getYouTubeThumb(videoId)}
  alt={title}
  style={styles.searchThumb}
/>

<div style={styles.searchResultMeta}>
  <div className="search-result-title" style={styles.searchResultTitle}>
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
   {isHost && (
  <label style={styles.autoQueueInline}>
  <input
    type="checkbox"
    checked={autoQueueEnabled}
    onChange={(e) => updateAutoQueueSetting(e.target.checked)}
  />
  Auto Queue
  {isAutoQueuing ? "..." : ""}
</label>
)}   
  <div className="queue-header" style={styles.queueHeader}>Queue ({queue.length})</div>

  <button
    style={{
      ...styles.clearQueueButton,
      ...(!isHost || queue.length === 0 ? styles.disabledButton : {}),
    }}
    onClick={clearQueue}
disabled={!isHost || (!playerVideoId && queue.length === 0 && !autoQueueEnabled)}  >
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
const brand = {
  bg: "#020204",
  bg2: "#080711",
  bg3: "#0b0718",
  purple: "#8b5cf6",
  purpleDark: "#7c3aed",
  purpleSoft: "#ede9fe",
  purpleTint: "#f5f3ff",
  borderPurple: "#c4b5fd",
  card: "rgba(255,255,255,0.97)",
  text: "#111827",
  muted: "#6b7280",
};

const styles = {
  autoQueueInline: {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  fontWeight: 900,
  color: brand.text,
  background: brand.purpleTint,
  border: "1px solid rgba(139,92,246,0.28)",
  borderRadius: "999px",
  padding: "9px 12px",
},
  page: {
    minHeight: "100vh",
    width: "100%",
    overflowX: "hidden",
    background:
      "radial-gradient(circle at top center, rgba(139,92,246,0.30) 0%, transparent 34%), linear-gradient(180deg, #080711 0%, #0b0718 45%, #020204 100%)",
    padding: "30px",
    boxSizing: "border-box",
    color: brand.text,
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
    gap: "14px",
    flexWrap: "wrap",
  },

  roomTitle: {
    margin: 0,
    fontSize: "3rem",
    fontWeight: 950,
    lineHeight: 1,
    letterSpacing: "-0.04em",
    color: "#ffffff",
  },

  copyButton: {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: "999px",
    padding: "10px 14px",
    fontWeight: 900,
    fontSize: "0.9rem",
    cursor: "pointer",
    background: "rgba(255,255,255,0.96)",
    color: brand.text,
  },

  shareButton: {
    padding: "11px 15px",
    borderRadius: "999px",
    border: "1px solid rgba(139,92,246,0.45)",
    background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 12px 28px rgba(139,92,246,0.34)",
  },

  leaveButton: {
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: "999px",
    padding: "10px 14px",
    fontWeight: 900,
    fontSize: "0.9rem",
    cursor: "pointer",
    background: "rgba(255,255,255,0.12)",
    color: "white",
  },

  roleText: {
    margin: "14px 0 6px",
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "rgba(255,255,255,0.94)",
  },

  subtleText: {
    margin: 0,
    opacity: 0.88,
    fontSize: "1.02rem",
    color: "rgba(255,255,255,0.82)",
  },

  qrCard: {
    background: "rgba(255,255,255,0.96)",
    padding: "14px",
    borderRadius: "18px",
    display: "flex",
    alignItems: "center",
    gap: "14px",
    width: "fit-content",
    border: "1px solid rgba(139,92,246,0.28)",
    boxShadow: "0 14px 34px rgba(0,0,0,0.22)",
  },

  qrText: {
    color: brand.text,
    fontWeight: 900,
    fontSize: "0.95rem",
  },

  nowPlayingCard: {
    background: brand.card,
    borderRadius: "28px",
    padding: "26px",
    boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
    border: "1px solid rgba(139,92,246,0.18)",
  },

  sectionHeading: {
    fontSize: "1.35rem",
    fontWeight: 950,
    marginBottom: "18px",
    color: brand.text,
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
    color: brand.purpleDark,
    fontWeight: 900,
    marginBottom: "8px",
  },

  nowPlayingTitle: {
    fontSize: "2.3rem",
    fontWeight: 950,
    lineHeight: 1.02,
    color: brand.text,
    wordBreak: "break-word",
  },

  elapsedText: {
    marginTop: "12px",
    color: brand.muted,
    fontSize: "1.05rem",
    fontWeight: 700,
  },

  playerCard: {
    background: brand.card,
    borderRadius: "28px",
    padding: "18px",
    boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
    border: "1px solid rgba(139,92,246,0.18)",
    overflow: "hidden",
  },

  emptyPlayer: {
    minHeight: "440px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: brand.muted,
    fontSize: "1.05rem",
    fontWeight: 700,
    textAlign: "center",
    padding: "20px",
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
    filter: "brightness(0.50)",
  },

  guestPlayerOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    padding: "24px",
    color: "white",
    background: "linear-gradient(180deg, transparent 20%, rgba(2,2,4,0.72) 100%)",
  },

  guestPlayerLabel: {
    fontSize: "0.95rem",
    fontWeight: 900,
    opacity: 0.88,
    marginBottom: "8px",
    color: brand.purpleSoft,
  },

  guestPlayerTitle: {
    fontSize: "2rem",
    fontWeight: 950,
    lineHeight: 1.1,
  },

  guestPlayerSub: {
    marginTop: "10px",
    fontSize: "1rem",
    fontWeight: 700,
    opacity: 0.86,
  },

  controlsCard: {
    background: brand.card,
    borderRadius: "24px",
    padding: "18px",
    boxShadow: "0 24px 70px rgba(0,0,0,0.25)",
    border: "1px solid rgba(139,92,246,0.18)",
  },

  controlsRow: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
  },

  primaryButton: {
    border: "none",
    borderRadius: "999px",
    padding: "13px 20px",
    fontWeight: 950,
    fontSize: "1rem",
    cursor: "pointer",
    background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
    color: "white",
    boxShadow: "0 12px 28px rgba(139,92,246,0.35)",
  },

  secondaryButton: {
    border: "1px solid rgba(139,92,246,0.35)",
    borderRadius: "999px",
    padding: "13px 20px",
    fontWeight: 950,
    fontSize: "1rem",
    cursor: "pointer",
    background: "rgba(139,92,246,0.12)",
    color: brand.purpleDark,
  },

  instructionsCard: {
    background: brand.card,
    borderRadius: "22px",
    padding: "18px",
    boxShadow: "0 24px 70px rgba(0,0,0,0.22)",
    border: "1px solid rgba(139,92,246,0.16)",
  },

  instructionsTitle: {
    color: brand.text,
    fontSize: "1.15rem",
    fontWeight: 950,
    marginBottom: "10px",
  },

  instructionsList: {
    display: "grid",
    gap: "8px",
    color: "#4b5563",
    fontWeight: 800,
  },

  addCard: {
    background: brand.card,
    borderRadius: "24px",
    padding: "20px",
    boxShadow: "0 24px 70px rgba(0,0,0,0.25)",
    border: "1px solid rgba(139,92,246,0.18)",
  },

  addRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: "12px",
    alignItems: "center",
    width: "100%",
  },

  searchInput: {
    flex: 1,
    minWidth: 0,
    width: "100%",
    height: "56px",
    borderRadius: "18px",
    border: "1px solid rgba(139,92,246,0.25)",
    padding: "0 16px",
    fontSize: "16px",
    fontWeight: 800,
    color: brand.text,
    background: "#ffffff",
    caretColor: brand.purpleDark,
    WebkitTextFillColor: brand.text,
    outline: "none",
    boxShadow: "0 10px 24px rgba(15,23,42,0.06)",
  },

  searchResults: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    marginTop: "16px",
  },

  searchResultItem: {
    display: "grid",
    gridTemplateColumns: "96px minmax(0, 1fr) 86px",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    padding: "12px",
    borderRadius: "18px",
    background: "#faf9ff",
    border: "1px solid rgba(139,92,246,0.18)",
  },

  searchThumb: {
    width: "96px",
    height: "54px",
    borderRadius: "12px",
    objectFit: "cover",
    flexShrink: 0,
  },

  searchResultMeta: {
    flex: 1,
    minWidth: 0,
  },

  searchResultTitle: {
    fontWeight: 950,
    color: brand.text,
    lineHeight: 1.2,
    width: "100%",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  },

  searchResultChannel: {
    marginTop: "4px",
    color: brand.muted,
    fontSize: "0.9rem",
    fontWeight: 700,
  },

  addButton: {
    border: "none",
    borderRadius: "999px",
    padding: "12px 16px",
    fontWeight: 950,
    fontSize: "0.95rem",
    cursor: "pointer",
    background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
    color: "white",
    boxShadow: "0 10px 24px rgba(139,92,246,0.26)",
  },

  queuePanel: {
    background: brand.card,
    borderRadius: "28px",
    padding: "22px",
    boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
    border: "1px solid rgba(139,92,246,0.18)",
  },

  queueHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
    gap: "10px",
    flexWrap: "wrap",
  },

  queueHeader: {
    fontSize: "2.2rem",
    fontWeight: 950,
    marginBottom: "18px",
    color: brand.text,
    letterSpacing: "-0.03em",
  },

  clearQueueButton: {
    border: "1px solid rgba(220,38,38,0.18)",
    borderRadius: "999px",
    padding: "10px 14px",
    fontWeight: 900,
    fontSize: "0.9rem",
    cursor: "pointer",
    background: "#fee2e2",
    color: "#991b1b",
  },

  emptyQueue: {
    color: brand.muted,
    padding: "16px 4px",
    fontSize: "1rem",
    fontWeight: 700,
  },

queueItem: {
  background: "#fbfaff",
  border: "1px solid rgba(139,92,246,0.22)",
  borderRadius: "22px",
  padding: "14px",
  marginBottom: "14px",
  boxShadow: "0 10px 24px rgba(15,23,42,0.08)",
  display: "flex",
  flexDirection: "column",
  gap: "14px",
},

queueItemTop: {
  display: "grid",
  gridTemplateColumns: "96px minmax(0, 1fr)",
  gap: "14px",
  alignItems: "center",
  width: "100%",
},

queueThumb: {
  width: "96px",
  height: "72px",
  objectFit: "cover",
  borderRadius: "14px",
  background: "#111827",
  flexShrink: 0,
},

queueMeta: {
  minWidth: 0,
  width: "100%",
},

  queueItemTitle: {
    fontSize: "1rem",
    fontWeight: 950,
    lineHeight: 1.25,
    marginBottom: "7px",
    color: brand.text,
    wordBreak: "break-word",
  },

  queueSub: {
    color: brand.muted,
    fontSize: "0.95rem",
    marginBottom: "4px",
    fontWeight: 700,
  },

  voteText: {
    color: brand.text,
    fontSize: "1rem",
    fontWeight: 950,
    marginTop: "8px",
  },

  queueActions: {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "8px",
  width: "100%",
},

  queueActionButton: {
    border: "1px solid rgba(139,92,246,0.35)",
    borderRadius: "14px",
    padding: "10px 12px",
    fontWeight: 950,
    fontSize: "0.9rem",
    cursor: "pointer",
    background: "rgba(139,92,246,0.12)",
    color: brand.purpleDark,
  },

  iconButton: {
    border: "1px solid rgba(139,92,246,0.35)",
    borderRadius: "14px",
    padding: "10px 12px",
    fontWeight: 950,
    fontSize: "0.95rem",
    cursor: "pointer",
    background: "rgba(139,92,246,0.18)",
    color: brand.purpleDark,
  },

  disabledButton: {
    opacity: 0.45,
    cursor: "not-allowed",
  },

  statusCard: {
    background: brand.card,
    borderRadius: "22px",
    padding: "26px",
    boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
    maxWidth: "540px",
    border: "1px solid rgba(139,92,246,0.18)",
  },

  mobileNotice: {
    display: "none",
  },
};