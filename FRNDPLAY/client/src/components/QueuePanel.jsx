import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";

function isValidYouTubeId(value) {
  return /^[a-zA-Z0-9_-]{11}$/.test(String(value || "").trim());
}

function extractYouTubeId(input) {
  const s = String(input || "").trim();
  if (!s) return "";

  if (isValidYouTubeId(s)) return s;

  try {
    const url = new URL(s);

    const v = url.searchParams.get("v");
    if (isValidYouTubeId(v)) return v;

    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.split("/").filter(Boolean)[0];
      if (isValidYouTubeId(id)) return id;
    }

    const parts = url.pathname.split("/").filter(Boolean);

    const embedIndex = parts.findIndex((p) => p === "embed");
    if (embedIndex >= 0 && isValidYouTubeId(parts[embedIndex + 1])) {
      return parts[embedIndex + 1];
    }

    const shortsIndex = parts.findIndex((p) => p === "shorts");
    if (shortsIndex >= 0 && isValidYouTubeId(parts[shortsIndex + 1])) {
      return parts[shortsIndex + 1];
    }

    const liveIndex = parts.findIndex((p) => p === "live");
    if (liveIndex >= 0 && isValidYouTubeId(parts[liveIndex + 1])) {
      return parts[liveIndex + 1];
    }
  } catch {}

  return "";
}

function cleanTitleFromId(videoId) {
  const id = String(videoId || "").trim();
  return id ? `YouTube Video (${id})` : "Untitled Video";
}

function getDefaultThumbnail(videoId) {
  const id = String(videoId || "").trim();
  return isValidYouTubeId(id)
    ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
    : "";
}

async function getYouTubeMeta(videoId) {
  const id = String(videoId || "").trim();

  if (!isValidYouTubeId(id)) {
    return {
      title: cleanTitleFromId(id),
      thumbnail: "",
    };
  }

  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${id}`
      )}&format=json`
    );

    if (!res.ok) {
      throw new Error(`Metadata fetch failed (${res.status})`);
    }

    const data = await res.json();

    return {
      title: String(data?.title || "").trim() || cleanTitleFromId(id),
      thumbnail:
        String(data?.thumbnail_url || "").trim() || getDefaultThumbnail(id),
    };
  } catch {
    return {
      title: cleanTitleFromId(id),
      thumbnail: getDefaultThumbnail(id),
    };
  }
}

export default function QueuePanel({ roomId, isHost, onPlay }) {
  const [items, setItems] = useState([]);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const countLabel = useMemo(() => items.length, [items]);

  useEffect(() => {
    if (!roomId) {
      setItems([]);
      return;
    }

    let alive = true;
    let backfilling = false;

    async function backfillMissingMetadata(queueItems) {
      if (backfilling) return;
      backfilling = true;

      try {
        const missing = (queueItems || []).filter(
          (item) =>
            item?.id &&
            isValidYouTubeId(item.video_id) &&
            (!String(item.title || "").trim() ||
              !String(item.thumbnail || "").trim() ||
              String(item.title || "").trim().startsWith("YouTube Video ("))
        );

        if (missing.length === 0) return;

        for (const item of missing) {
          const meta = await getYouTubeMeta(item.video_id);

          await supabase
            .from("queue_items")
            .update({
              title: meta.title || cleanTitleFromId(item.video_id),
              thumbnail: meta.thumbnail || getDefaultThumbnail(item.video_id),
            })
            .eq("id", item.id);
        }
      } catch (err) {
        console.warn("Queue metadata backfill error:", err);
      } finally {
        backfilling = false;
      }
    }

    async function loadQueue() {
      const { data, error } = await supabase
        .from("queue_items")
        .select("*")
        .eq("room_id", String(roomId))
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });

      if (!alive) return;

      if (error) {
        console.error("Queue load error:", error);
        setErrorMsg(error.message || "Failed to load queue.");
        return;
      }

      const normalized = (data || []).map((item) => ({
        ...item,
        title:
          String(item.title || "").trim() || cleanTitleFromId(item.video_id),
        thumbnail:
          String(item.thumbnail || "").trim() ||
          getDefaultThumbnail(item.video_id),
      }));

      setItems(normalized);
      backfillMissingMetadata(data || []);
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

  const handleAdd = async () => {
    if (!roomId || adding) return;

    setErrorMsg("");

    const videoId = extractYouTubeId(input);
    if (!isValidYouTubeId(videoId)) {
      setErrorMsg("Enter a valid YouTube link or 11-character video id.");
      return;
    }

    setAdding(true);

    try {
      const nextPosition =
        items.length > 0
          ? Math.max(...items.map((x) => Number(x.position || 0))) + 1
          : 1;

      const meta = await getYouTubeMeta(videoId);

      const payload = {
        room_id: String(roomId),
        video_id: videoId,
        title: meta.title || cleanTitleFromId(videoId),
        thumbnail: meta.thumbnail || getDefaultThumbnail(videoId),
        provider: "youtube",
        position: nextPosition,
      };

      const { error } = await supabase.from("queue_items").insert(payload);

      if (error) {
        console.error("Queue add error:", error);
        setErrorMsg(error.message || "Failed to add item.");
        return;
      }

      setInput("");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (item) => {
    if (!item || busyId) return;

    setBusyId(item.id || item.video_id || "removing");
    setErrorMsg("");

    try {
      const rowId = item?.id;
      if (!rowId) {
        setErrorMsg("Remove failed: item.id is missing.");
        console.error("Remove failed because item.id is missing:", item);
        return;
      }

      const { data, error } = await supabase
        .from("queue_items")
        .delete()
        .eq("id", rowId)
        .select();

      if (error) {
        console.error("Queue remove error:", error);
        setErrorMsg(error.message || "Failed to remove item.");
        return;
      }

      if (!data || data.length === 0) {
        setErrorMsg(
          "Nothing was removed. This is usually a Supabase delete policy issue."
        );
        return;
      }

      setItems((prev) => prev.filter((x) => x.id !== rowId));
    } finally {
      setBusyId("");
    }
  };

  const handlePlay = async (item) => {
    if (!item?.video_id || !isHost || busyId) return;

    setBusyId(item.id || item.video_id);
    setErrorMsg("");

    try {
      await onPlay?.(item.video_id);
    } catch (err) {
      console.error("Queue play error:", err);
      setErrorMsg("Failed to start playback.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 18,
        padding: 18,
        background: "#fff",
        boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: 14 }}>Queue ({countLabel})</h3>

      <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste YouTube link or video id"
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #d1d5db",
            outline: "none",
            fontSize: 16,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
        />

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={handleAdd}
            disabled={!roomId || adding}
            style={{
              padding: "10px 16px",
              borderRadius: 12,
              border: "1px solid #111",
              background: !roomId || adding ? "#f3f4f6" : "#111",
              color: !roomId || adding ? "#666" : "#fff",
              cursor: !roomId || adding ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            {adding ? "Adding..." : "Add to Queue"}
          </button>
        </div>

        {errorMsg ? (
          <div style={{ color: "#b91c1c", fontSize: 14 }}>{errorMsg}</div>
        ) : null}
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {items.length === 0 ? (
          <div
            style={{
              border: "1px dashed #d1d5db",
              borderRadius: 14,
              padding: 16,
              color: "#6b7280",
            }}
          >
            Queue is empty.
          </div>
        ) : null}

        {items.map((item, index) => {
          const title =
            String(item.title || "").trim() || cleanTitleFromId(item.video_id);

          const thumbnail =
            String(item.thumbnail || "").trim() ||
            getDefaultThumbnail(item.video_id);

          const isBusy = busyId === item.id || busyId === item.video_id;

          return (
            <div
              key={item.id || `${item.video_id}-${index}`}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                padding: 12,
                background: "#fff",
                display: "grid",
                gridTemplateColumns: "120px 1fr",
                gap: 12,
                alignItems: "start",
              }}
            >
              <div
                style={{
                  width: "100%",
                  aspectRatio: "16 / 9",
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "#111",
                }}
              >
                {thumbnail ? (
                  <img
                    src={thumbnail}
                    alt={title}
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
                    fontWeight: 800,
                    fontSize: 15,
                    marginBottom: 6,
                    wordBreak: "break-word",
                    lineHeight: 1.35,
                  }}
                >
                  {title}
                </div>

                <div
                  style={{
                    color: "#6b7280",
                    fontSize: 13,
                    marginBottom: 4,
                    textTransform: "capitalize",
                  }}
                >
                  {String(item.provider || "youtube")}
                </div>

                <div
                  style={{
                    color: "#6b7280",
                    fontSize: 13,
                    marginBottom: 12,
                  }}
                >
                  Queue position: {Number(item.position || index + 1)}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={() => handlePlay(item)}
                    disabled={!isHost || isBusy}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 12,
                      border: "1px solid #d1d5db",
                      background: !isHost || isBusy ? "#f3f4f6" : "#fff",
                      cursor: !isHost || isBusy ? "not-allowed" : "pointer",
                      fontWeight: 700,
                    }}
                  >
                    Play
                  </button>

                  <button
                    onClick={() => handleRemove(item)}
                    disabled={isBusy}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 12,
                      border: "1px solid #d1d5db",
                      background: isBusy ? "#f3f4f6" : "#fff",
                      cursor: isBusy ? "not-allowed" : "pointer",
                      fontWeight: 700,
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}