// client/src/components/RoomView.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";

// Helpers
function fmtDate(dt) {
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return "";
  }
}
function msUntil(iso) {
  const t = new Date(iso).getTime();
  return t - Date.now();
}
function humanCountdown(ms) {
  if (!Number.isFinite(ms)) return "";
  if (ms <= 0) return "0m";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// Extract YouTube video id from URL or allow raw id
function extractYouTubeId(input) {
  const s = String(input || "").trim();
  if (!s) return "";

  // If it's already an 11-char-ish id with safe chars
  if (/^[a-zA-Z0-9_-]{6,20}$/.test(s) && !s.includes("http")) return s;

  try {
    const url = new URL(s);
    // youtu.be/<id>
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.replace("/", "").trim();
    }
    // youtube.com/watch?v=<id>
    const v = url.searchParams.get("v");
    if (v) return v.trim();

    // youtube.com/embed/<id>
    const parts = url.pathname.split("/").filter(Boolean);
    const embedIndex = parts.indexOf("embed");
    if (embedIndex >= 0 && parts[embedIndex + 1]) return parts[embedIndex + 1].trim();

    // youtube.com/shorts/<id>
    const shortsIndex = parts.indexOf("shorts");
    if (shortsIndex >= 0 && parts[shortsIndex + 1]) return parts[shortsIndex + 1].trim();
  } catch {
    // not a URL
  }

  return "";
}

export default function RoomView({ room, setRoom, onLeave, user }) {
  const [members, setMembers] = useState([]);
  const [queue, setQueue] = useState([]);
  const [nowPlaying, setNowPlaying] = useState(null);

  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [busyPay, setBusyPay] = useState(false);

  const [statusMsg, setStatusMsg] = useState("");
  const [countdown, setCountdown] = useState("");

  // Add song UI state
  const [songInput, setSongInput] = useState("");
  const [adding, setAdding] = useState(false);

  const expiresAt = room?.expires_at ?? null;

  const isHost = useMemo(() => {
    const owner = room?.owner_id ?? room?.host_user_id;
    return !!user?.id && !!owner && user.id === owner;
  }, [room, user]);

  const roomIsActive = useMemo(() => {
    if (expiresAt && msUntil(expiresAt) <= 0) return false;
    return !!room?.party_active;
  }, [room?.party_active, expiresAt]);

  const canControlQueue = roomIsActive;

  // Countdown
  useEffect(() => {
    if (!expiresAt) {
      setCountdown("");
      return;
    }
    const tick = () => {
      const ms = msUntil(expiresAt);
      if (ms <= 0) setCountdown("Expired");
      else setCountdown(`Active for ${humanCountdown(ms)} (until ${fmtDate(expiresAt)})`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  // Fetch members
  const fetchMembers = async () => {
    if (!room?.id) return;
    setLoadingMembers(true);
    try {
      const { data, error } = await supabase
        .from("room_members")
        .select("id, user_id, role")
        .eq("room_id", room.id);

      if (error) throw error;
      setMembers(data ?? []);
    } catch (e) {
      setStatusMsg(`Members load failed: ${String(e.message ?? e)}`);
    } finally {
      setLoadingMembers(false);
    }
  };

  // Fetch queue
  const fetchQueue = async () => {
    if (!room?.id) return;
    setLoadingQueue(true);
    try {
      const { data, error } = await supabase
        .from("queue_items")
        .select("id, room_id, provider, track_id, title, artist, artwork_url, position, added_by, created_at")
        .eq("room_id", room.id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;
      const items = data ?? [];
      setQueue(items);
      setNowPlaying(items[0] ?? null);
    } catch (e) {
      setStatusMsg(`Queue load failed: ${String(e.message ?? e)}`);
    } finally {
      setLoadingQueue(false);
    }
  };

  // Realtime subscriptions
  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase
      .channel(`room:${room.id}:realtime`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${room.id}` },
        (payload) => {
          const updated = payload?.new;
          if (updated) setRoom(updated);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_items", filter: `room_id=eq.${room.id}` },
        () => fetchQueue()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_members", filter: `room_id=eq.${room.id}` },
        () => fetchMembers()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

  // Initial load
  useEffect(() => {
    fetchMembers();
    fetchQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

  // Verify Stripe return (session_id in URL)
  useEffect(() => {
    const url = new URL(window.location.href);
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId || !room?.id) return;

    const verify = async () => {
      try {
        setStatusMsg("Verifying payment...");
        const { error } = await supabase.functions.invoke("verify-checkout-session", {
          body: { session_id: sessionId, room_id: room.id },
        });
        if (error) throw error;

        const { data: freshRoom, error: roomErr } = await supabase
          .from("rooms")
          .select("*")
          .eq("id", room.id)
          .single();
        if (roomErr) throw roomErr;

        setRoom(freshRoom);

        url.searchParams.delete("session_id");
        window.history.replaceState({}, "", url.toString());

        setStatusMsg("Payment verified ✅");
      } catch (e) {
        setStatusMsg(`Verify failed: ${String(e.message ?? e)}`);
      }
    };

    verify();
  }, [room?.id, setRoom]);

  // Checkout (pay/renew)
  const startCheckout = async ({ mode }) => {
    if (!room?.id) return;
    setBusyPay(true);
    setStatusMsg("");
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: { room_id: room.id, intent: mode },
      });
      if (error) throw error;

      const checkoutUrl = data?.url || data?.checkout_url;
      if (!checkoutUrl) throw new Error("No checkout URL returned.");

      window.location.href = checkoutUrl;
    } catch (e) {
      setStatusMsg(`Checkout failed: ${String(e.message ?? e)}`);
    } finally {
      setBusyPay(false);
    }
  };

  // Next track (delete current and renumber)
  const nextTrack = async () => {
    if (!canControlQueue) return;
    try {
      if (queue.length <= 1) return;
      const [current, ...rest] = queue;

      await supabase.from("queue_items").delete().eq("id", current.id);

      for (let i = 0; i < rest.length; i++) {
        // eslint-disable-next-line no-await-in-loop
        await supabase.from("queue_items").update({ position: i }).eq("id", rest[i].id);
      }
    } catch (e) {
      setStatusMsg(`Next failed: ${String(e.message ?? e)}`);
    }
  };

  // ✅ Add song handler
  const addSong = async () => {
    if (!canControlQueue) {
      setStatusMsg("Room is expired — renew to add songs.");
      return;
    }
    if (!room?.id) return;
    if (!user?.id) {
      setStatusMsg("You must be signed in to add songs.");
      return;
    }

    const videoId = extractYouTubeId(songInput);
    if (!videoId) {
      setStatusMsg("Paste a YouTube URL or video ID.");
      return;
    }

    setAdding(true);
    setStatusMsg("");

    try {
      const nextPos = queue.length;

      const artworkUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      const payload = {
        room_id: room.id,
        added_by: user.id,
        provider: "youtube",
        track_id: videoId,
        title: videoId, // simple fallback; you can fetch real title later
        artist: "",
        artwork_url: artworkUrl,
        position: nextPos,
      };

      const { error } = await supabase.from("queue_items").insert([payload]);
      if (error) throw error;

      setSongInput("");
      setStatusMsg("Added ✅");
      // realtime will refresh queue
    } catch (e) {
      setStatusMsg(`Add failed: ${String(e.message ?? e)}`);
    } finally {
      setAdding(false);
    }
  };

  const copyShareLink = async () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("session_id");
      await navigator.clipboard.writeText(url.toString());
      setStatusMsg("Share link copied ✅");
    } catch {
      setStatusMsg("Could not copy link (clipboard blocked).");
    }
  };

  const PartyModeCard = () => (
    <div style={styles.card}>
      <h3 style={{ marginTop: 0 }}>Party Mode</h3>

      {roomIsActive ? (
        <div style={{ color: "green", fontWeight: 700 }}>✅ {countdown}</div>
      ) : (
        <div style={{ color: "#b00020", fontWeight: 800 }}>❌ Room expired</div>
      )}

      {!roomIsActive && (
        <div style={{ marginTop: 12 }}>
          {isHost ? (
            <>
              <div style={{ marginBottom: 10 }}>
                Renewing will extend Party Mode for another <b>24 hours</b>.
              </div>
              <button
                onClick={() => startCheckout({ mode: "renew" })}
                disabled={busyPay}
                style={styles.primaryBtn}
              >
                {busyPay ? "Opening checkout..." : "Renew for $5"}
              </button>
            </>
          ) : (
            <div style={{ marginTop: 10 }}>Ask the host to renew this room to continue the party.</div>
          )}
        </div>
      )}
    </div>
  );

  const NowPlaying = () => {
    const item = nowPlaying;
    if (!item) {
      return (
        <div style={styles.card}>
          <h3 style={{ marginTop: 0 }}>Now Playing (Room-wide)</h3>
          <div>No track yet.</div>
        </div>
      );
    }

    const provider = (item.provider || "").toLowerCase();
    const youtubeSrc =
      provider === "youtube" && item.track_id
        ? `https://www.youtube.com/embed/${item.track_id}?autoplay=0&rel=0`
        : null;

    return (
      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ marginTop: 0 }}>Now Playing (Room-wide)</h3>
          <button onClick={nextTrack} disabled={!canControlQueue} style={styles.secondaryBtn}>
            Next ▶
          </button>
        </div>

        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 800 }}>{item.title || "Untitled"}</div>
          <div style={{ opacity: 0.8 }}>{item.artist || ""}</div>
        </div>

        {youtubeSrc ? (
          <div style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 12, overflow: "hidden" }}>
            <iframe
              title="now-playing"
              src={youtubeSrc}
              width="100%"
              height="100%"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ border: 0 }}
            />
          </div>
        ) : (
          <div style={{ textAlign: "center", opacity: 0.75 }}>
            (Embed not configured for provider: {provider || "unknown"})
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Room</h1>
          <div style={styles.metaRow}>
            <div>
              <b>Code:</b> {room?.code || ""}
            </div>
            <div>
              <b>Party:</b> {roomIsActive ? "Active" : "Expired"}
            </div>
            <div>
              <b>Role:</b> {isHost ? "Host" : "Guest"}
            </div>
          </div>
        </div>

        <div style={styles.headerBtns}>
          <button onClick={copyShareLink} style={styles.secondaryBtn}>
            Copy Share Link
          </button>
          <button onClick={onLeave} style={styles.secondaryBtn}>
            Leave
          </button>
        </div>
      </div>

      {statusMsg ? <div style={styles.status}>{statusMsg}</div> : null}

      <PartyModeCard />

      {/* ✅ Add Song */}
      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Add a Song</h3>
        <div style={{ opacity: 0.8, marginBottom: 10 }}>
          Paste a YouTube link (or video ID). Example: <span style={{ fontFamily: "monospace" }}>dQw4w9WgXcQ</span>
        </div>

        {!roomIsActive && (
          <div style={{ color: "#b00020", marginBottom: 10 }}>
            Room is expired — renew to add songs.
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={songInput}
            onChange={(e) => setSongInput(e.target.value)}
            placeholder="YouTube URL or video ID"
            style={styles.input}
            disabled={!roomIsActive || adding}
          />
          <button
            onClick={addSong}
            disabled={!roomIsActive || adding}
            style={styles.primaryBtn}
          >
            {adding ? "Adding..." : "Add"}
          </button>
        </div>
      </div>

      <NowPlaying />

      {/* Queue */}
      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ marginTop: 0 }}>Queue</h3>
          <div style={{ opacity: 0.8, fontSize: 14 }}>
            {loadingQueue ? "Loading..." : `${queue.length} track(s)`}
          </div>
        </div>

        {!roomIsActive && (
          <div style={{ color: "#b00020", marginBottom: 10 }}>
            Queue controls are disabled because the room is expired.
          </div>
        )}

        <ul style={{ listStyle: "none", paddingLeft: 0, margin: 0 }}>
          {queue.map((item, idx) => (
            <li key={item.id} style={styles.queueItem}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {item.artwork_url ? (
                  <img
                    src={item.artwork_url}
                    alt=""
                    style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover" }}
                  />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: "#eee" }} />
                )}

                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>
                    {idx === 0 ? "▶ " : ""}
                    {item.title || "Untitled"}
                  </div>
                  <div style={{ opacity: 0.8 }}>{item.artist || ""}</div>
                </div>

                <button
                  disabled={!canControlQueue}
                  style={styles.dangerBtn}
                  onClick={async () => {
                    if (!canControlQueue) return;
                    try {
                      await supabase.from("queue_items").delete().eq("id", item.id);
                    } catch (e) {
                      setStatusMsg(`Delete failed: ${String(e.message ?? e)}`);
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>

        {queue.length === 0 && <div style={{ opacity: 0.75 }}>No songs in the queue yet.</div>}
      </div>

      {/* Members */}
      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ marginTop: 0 }}>Members</h3>
          <div style={{ opacity: 0.8, fontSize: 14 }}>
            {loadingMembers ? "Loading..." : `${members.length} member(s)`}
          </div>
        </div>

        <ul style={{ listStyle: "none", paddingLeft: 0, margin: 0 }}>
          {members.map((m) => (
            <li key={m.id} style={{ padding: "8px 0", borderBottom: "1px solid #eee" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontFamily: "monospace", fontSize: 13, opacity: 0.9 }}>
                  {m.user_id}
                </div>
                <div style={{ fontWeight: 800 }}>{m.role || ""}</div>
              </div>
            </li>
          ))}
        </ul>

        {members.length === 0 && <div style={{ opacity: 0.75 }}>No members yet.</div>}
      </div>
    </div>
  );
}

const styles = {
  wrap: { maxWidth: 900, margin: "40px auto", padding: "0 16px" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    marginBottom: 18,
  },
  title: { margin: 0, fontSize: 44, lineHeight: 1.1 },
  metaRow: { display: "grid", gap: 6, marginTop: 10, fontSize: 16 },
  headerBtns: { display: "flex", gap: 10 },
  card: {
    background: "white",
    border: "1px solid #e9e9e9",
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  },
  status: {
    background: "#f5f7ff",
    border: "1px solid #dfe6ff",
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  queueItem: { padding: "10px 0", borderBottom: "1px solid #eee" },
  input: {
    flex: 1,
    minWidth: 240,
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    fontSize: 14,
  },
  primaryBtn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #111",
    background: "#111",
    color: "white",
    cursor: "pointer",
    fontWeight: 800,
  },
  secondaryBtn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
    fontWeight: 800,
  },
  dangerBtn: {
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #ffb3b3",
    background: "#fff5f5",
    cursor: "pointer",
    fontWeight: 800,
  },
};
