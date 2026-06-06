import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { searchYouTubeSongs } from "../lib/youtube";
import SongSearch from "./SongSearch";
import AutoQueueControls from "./AutoQueueControls";

function isValidYouTubeId(value) {
  return /^[a-zA-Z0-9_-]{11}$/.test(String(value || "").trim());
}

function normalizePosition(item, index) {
  const n = Number(item?.position);
  return Number.isFinite(n) ? n : index + 1;
}

function getNextQueuePosition(queue = []) {
  if (!Array.isArray(queue) || queue.length === 0) {
    return 1;
  }

  const positions = queue
    .map((item) => Number(item.position))
    .filter((position) => Number.isFinite(position));

  if (positions.length === 0) {
    return queue.length + 1;
  }

  return Math.max(...positions) + 1;
}

export default function QueuePanel({ roomId, isHost, onPlay }) {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [autoQueueEnabled, setAutoQueueEnabled] = useState(false);
  const [autoQueueVibe, setAutoQueueVibe] = useState("rap");
  const [isAutoQueuing, setIsAutoQueuing] = useState(false);

  useEffect(() => {
    if (!roomId) return;

    let alive = true;

    async function loadQueue() {
      setLoading(true);

      const { data, error } = await supabase
        .from("queue_items")
        .select("*")
        .eq("room_id", String(roomId))
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });

      if (!alive) return;

      if (error) {
        console.error("Queue load error:", error);
      } else {
        setQueue(data || []);
      }

      setLoading(false);
    }

    loadQueue();

    const channel = supabase
      .channel(`queue:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "queue_items",
          filter: `room_id=eq.${roomId}`,
        },
        () => loadQueue()
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;

    let alive = true;

    async function loadRoomSettings() {
      const { data, error } = await supabase
        .from("rooms")
        .select("auto_queue_enabled, auto_queue_vibe")
        .eq("id", String(roomId))
        .maybeSingle();

      if (!alive) return;

      if (error) {
        console.error("Room settings load error:", error);
        return;
      }

      setAutoQueueEnabled(Boolean(data?.auto_queue_enabled));
      setAutoQueueVibe(data?.auto_queue_vibe || "rap");
    }

    loadRoomSettings();

    const channel = supabase
      .channel(`room-settings:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          const updatedRoom = payload.new;

          setAutoQueueEnabled(Boolean(updatedRoom?.auto_queue_enabled));
          setAutoQueueVibe(updatedRoom?.auto_queue_vibe || "rap");
        }
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  useEffect(() => {
    if (!isHost) return;
    if (!autoQueueEnabled) return;
    if (isAutoQueuing) return;
    if (queue.length >= 2) return;

    autoFillQueue();
  }, [isHost, autoQueueEnabled, autoQueueVibe, queue.length, isAutoQueuing]);

  async function handleAddSong(song) {
    if (!roomId || busy) return;
    if (!isValidYouTubeId(song?.video_id)) return;

    setBusy(true);

    try {
      const nextPosition = getNextQueuePosition(queue);

      const { error } = await supabase.from("queue_items").insert({
        room_id: String(roomId),
        video_id: song.video_id,
        title: song.title || "Untitled video",
        thumbnail: song.thumbnail_url || "",
        position: nextPosition,
        source: "user",
      });

      if (error) throw error;
    } catch (err) {
      console.error("Add song failed:", err);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id) {
    if (!isHost || busy) return;

    setBusy(true);

    try {
      const { error } = await supabase.from("queue_items").delete().eq("id", id);

      if (error) throw error;
    } catch (err) {
      console.error("Queue remove failed:", err);
    } finally {
      setBusy(false);
    }
  }

  function handlePlay(videoId) {
    if (!isHost || !isValidYouTubeId(videoId)) return;

    if (typeof onPlay === "function") {
      onPlay(videoId);
    }
  }

  async function renumberQueue(itemsInNewOrder) {
    if (!isHost || busy) return;

    setBusy(true);

    try {
      for (let i = 0; i < itemsInNewOrder.length; i++) {
        const item = itemsInNewOrder[i];

        const { error } = await supabase
          .from("queue_items")
          .update({ position: i + 1 })
          .eq("id", item.id);

        if (error) throw error;
      }

      setQueue(
        itemsInNewOrder.map((item, index) => ({
          ...item,
          position: index + 1,
        }))
      );
    } catch (err) {
      console.error("Queue reorder failed:", err);
    } finally {
      setBusy(false);
    }
  }

  async function moveUp(index) {
    if (!isHost || busy || index <= 0) return;

    const next = [...queue];
    const temp = next[index - 1];

    next[index - 1] = next[index];
    next[index] = temp;

    await renumberQueue(next);
  }

  async function moveDown(index) {
    if (!isHost || busy || index >= queue.length - 1) return;

    const next = [...queue];
    const temp = next[index + 1];

    next[index + 1] = next[index];
    next[index] = temp;

    await renumberQueue(next);
  }

  async function updateAutoQueueSetting(enabled) {
    if (!isHost || !roomId) return;

    setAutoQueueEnabled(enabled);

    const { error } = await supabase
      .from("rooms")
      .update({
        auto_queue_enabled: enabled,
      })
      .eq("id", String(roomId));

    if (error) {
      console.error("Auto Queue setting update failed:", error);
    }
  }

  async function updateAutoQueueVibe(vibe) {
    if (!isHost || !roomId) return;

    setAutoQueueVibe(vibe);

    const { error } = await supabase
      .from("rooms")
      .update({
        auto_queue_vibe: vibe,
      })
      .eq("id", String(roomId));

    if (error) {
      console.error("Auto Queue vibe update failed:", error);
    }
  }

  async function autoFillQueue() {
    if (!isHost || !roomId || isAutoQueuing) return;

    setIsAutoQueuing(true);

    try {
      const searchQuery = `${autoQueueVibe || "rap"} music popular songs`;
      const results = await searchYouTubeSongs(searchQuery, 8);

      if (!results.length) return;

      const existingVideoIds = new Set(queue.map((item) => item.video_id));

      const songsToAdd = results
        .filter((song) => song?.video_id && !existingVideoIds.has(song.video_id))
        .slice(0, 3);

      if (!songsToAdd.length) return;

      const startingPosition = getNextQueuePosition(queue);

      const rows = songsToAdd.map((song, index) => ({
        room_id: String(roomId),
        video_id: song.video_id,
        title: song.title || "Untitled video",
        thumbnail: song.thumbnail_url || "",
        position: startingPosition + index,
        source: "auto_queue",
      }));

      const { error } = await supabase.from("queue_items").insert(rows);

      if (error) throw error;
    } catch (err) {
      console.error("Auto Queue failed:", err);
    } finally {
      setIsAutoQueuing(false);
    }
  }

  const buttonStyle = {
    border: "none",
    borderRadius: 14,
    padding: "10px 12px",
    background: "#f3f4f6",
    color: "#111827",
    fontWeight: 800,
    fontSize: 14,
    cursor: busy ? "not-allowed" : "pointer",
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 520,
        margin: "0 auto",
        border: "1px solid #e5e7eb",
        borderRadius: 24,
        padding: 16,
        background: "#ffffff",
        boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <h3
        style={{
          margin: "0 0 14px",
          fontSize: 28,
          lineHeight: 1.1,
          fontWeight: 900,
          color: "#111827",
        }}
      >
        Queue ({queue.length})
      </h3>

      {isHost && (
        <AutoQueueControls
          enabled={autoQueueEnabled}
          vibe={autoQueueVibe}
          isAutoQueuing={isAutoQueuing}
          onToggle={updateAutoQueueSetting}
          onChangeVibe={updateAutoQueueVibe}
        />
      )}

      <SongSearch onAddSong={handleAddSong} />

      {loading ? (
        <div style={{ color: "#6b7280" }}>Loading queue...</div>
      ) : queue.length === 0 ? (
        <div style={{ color: "#6b7280" }}>Queue is empty</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {queue.map((item, index) => (
            <div
              key={item.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 18,
                padding: 12,
                display: "grid",
                gridTemplateColumns: "100px minmax(0, 1fr)",
                gap: 12,
                background: "#fff",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  width: "100px",
                  height: "60px",
                  borderRadius: 14,
                  overflow: "hidden",
                  background: "#000",
                }}
              >
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                ) : null}
              </div>

              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: 18,
                    lineHeight: 1.15,
                    color: "#111827",
                    wordBreak: "break-word",
                  }}
                >
                  {item.title || item.video_id}
                </div>

                <div
                  style={{
                    fontSize: 13,
                    color: "#6b7280",
                    marginTop: 8,
                    wordBreak: "break-word",
                  }}
                >
                  Added by {item.added_by_email || "unknown"}
                </div>

                <div
                  style={{
                    fontSize: 13,
                    color: "#6b7280",
                    marginTop: 4,
                  }}
                >
                  Rank: {normalizePosition(item, index)}
                </div>

                {item.source === "auto_queue" && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "#6b7280",
                      marginTop: 4,
                      fontWeight: 800,
                    }}
                  >
                    Auto Queue
                  </div>
                )}

                {isHost && (
                  <div
                    style={{
                      marginTop: 12,
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 8,
                    }}
                  >
                    <button
                      onClick={() => handlePlay(item.video_id)}
                      disabled={busy}
                      style={buttonStyle}
                    >
                      Play
                    </button>

                    <button
                      onClick={() => handleRemove(item.id)}
                      disabled={busy}
                      style={buttonStyle}
                    >
                      Remove
                    </button>

                    <button
                      disabled={busy || index === 0}
                      onClick={() => moveUp(index)}
                      style={buttonStyle}
                    >
                      ↑
                    </button>

                    <button
                      disabled={busy || index === queue.length - 1}
                      onClick={() => moveDown(index)}
                      style={buttonStyle}
                    >
                      ↓
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}