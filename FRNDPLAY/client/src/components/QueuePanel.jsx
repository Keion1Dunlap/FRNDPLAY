import { useEffect, useState } from "react";
import { supabase } from "../supabase";

function isValidYouTubeId(value) {
  return /^[a-zA-Z0-9_-]{11}$/.test(String(value || "").trim());
}

function normalizePosition(item, index) {
  const n = Number(item?.position);
  return Number.isFinite(n) ? n : index + 1;
}

export default function QueuePanel({ roomId, isHost, onPlay }) {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

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
        () => {
          loadQueue();
        }
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const handleRemove = async (id) => {
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
  };

  const handlePlay = (videoId) => {
    if (!isHost || !isValidYouTubeId(videoId)) return;
    onPlay?.(videoId);
  };

  const renumberQueue = async (itemsInNewOrder) => {
    if (!isHost || busy) return;

    setBusy(true);

    try {
      const updates = itemsInNewOrder.map((item, index) => ({
        id: item.id,
        position: index + 1,
      }));

      for (const row of updates) {
        const { error } = await supabase
          .from("queue_items")
          .update({ position: row.position })
          .eq("id", row.id);

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
  };

  const moveUp = async (index) => {
    if (!isHost || busy || index <= 0) return;

    const next = [...queue];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    await renumberQueue(next);
  };

  const moveDown = async (index) => {
    if (!isHost || busy || index >= queue.length - 1) return;

    const next = [...queue];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    await renumberQueue(next);
  };

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 18,
        padding: 18,
        background: "#fff",
      }}
    >
      <h3 style={{ marginTop: 0 }}>Queue ({queue.length})</h3>

      {loading ? (
        <div>Loading queue...</div>
      ) : queue.length === 0 ? (
        <div style={{ color: "#6b7280" }}>Queue is empty</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {queue.map((item, index) => (
            <div
              key={item.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 10,
                display: "grid",
                gridTemplateColumns: "100px 1fr",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: "100%",
                  aspectRatio: "16/9",
                  borderRadius: 10,
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
                    }}
                  />
                ) : null}
              </div>

              <div>
                <div style={{ fontWeight: 800 }}>
                  {item.title || item.video_id}
                </div>

                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  Added by {item.added_by_email || "unknown"}
                </div>

                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                  Queue position: {normalizePosition(item, index)}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                  }}
                >
                  {isHost && (
                    <>
                      <button onClick={() => handlePlay(item.video_id)} disabled={busy}>
                        Play
                      </button>

                      <button onClick={() => handleRemove(item.id)} disabled={busy}>
                        Remove
                      </button>

                      <button
                        disabled={busy || index === 0}
                        onClick={() => moveUp(index)}
                      >
                        ↑
                      </button>

                      <button
                        disabled={busy || index === queue.length - 1}
                        onClick={() => moveDown(index)}
                      >
                        ↓
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}