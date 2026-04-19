// client/src/App.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";

import Auth from "./components/Auth";
import CreateRoom from "./components/CreateRoom";
import JoinRoom from "./components/JoinRoom";
import RoomView from "./components/RoomView";

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [room, setRoom] = useState(null);
  const [status, setStatus] = useState("");

  const roomCodeFromUrl = useMemo(() => {
    try {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("room");
      return code ? String(code).trim().toUpperCase() : "";
    } catch {
      return "";
    }
  }, []);

  const sessionIdFromUrl = useMemo(() => {
    try {
      const url = new URL(window.location.href);
      const sid = url.searchParams.get("session_id");
      return sid ? String(sid).trim() : "";
    } catch {
      return "";
    }
  }, []);

  // Prevent double insert/update storms
  const membershipInFlight = useRef(new Set());

  // ✅ Safe membership helper:
  // - Tries INSERT first
  // - If duplicate (23505), silently UPDATE presence instead
  // - Never overwrites role for existing membership
  const ensureMyMembership = async (roomRow, roleHint = "guest") => {
    if (!user?.id || !roomRow?.id) return;

    const desiredRole =
      roleHint === "host" ? "host" : roleHint === "member" ? "member" : "guest";

    const key = `${roomRow.id}:${user.id}`;
    if (membershipInFlight.current.has(key)) return;
    membershipInFlight.current.add(key);

    try {
      const { error: insErr } = await supabase.from("room_members").insert([
        {
          room_id: roomRow.id,
          user_id: user.id,
          role: desiredRole,
          last_seen_at: new Date().toISOString(),
        },
      ]);

      if (!insErr) return;

      // 23505 = already exists -> treat as success and update presence only
      if (insErr.code === "23505") {
        await supabase
          .from("room_members")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("room_id", roomRow.id)
          .eq("user_id", user.id);
        return;
      }

      throw insErr;
    } catch (e) {
      console.warn("ensureMyMembership failed:", e);
      setStatus(
        (prev) =>
          prev ||
          `Note: room_members write failed (RLS/constraints). ${String(
            e?.message ?? e
          )}`
      );
    } finally {
      membershipInFlight.current.delete(key);
    }
  };

  // Auth boot
  useEffect(() => {
    let ignore = false;

    const boot = async () => {
      try {
        setAuthLoading(true);

        const { data } = await supabase.auth.getSession();
        if (!ignore) setUser(data?.session?.user ?? null);

        const { data: sub } = supabase.auth.onAuthStateChange(
          (_event, session) => {
            setUser(session?.user ?? null);

            if (!session?.user) {
              // If they sign out, keep the ?room= in URL but drop room state (forces sign-in gate)
              setRoom(null);

              const url = new URL(window.location.href);
              if (url.searchParams.has("session_id")) {
                url.searchParams.delete("session_id");
                window.history.replaceState({}, "", url.toString());
              }
            }
          }
        );

        return () => sub.subscription.unsubscribe();
      } finally {
        if (!ignore) setAuthLoading(false);
      }
    };

    const cleanupPromise = boot();

    return () => {
      ignore = true;
      Promise.resolve(cleanupPromise).then((fn) => fn && fn());
    };
  }, []);

  // Load room from URL (even if not signed in, so we can show "Sign in to join CODE")
  useEffect(() => {
    if (!roomCodeFromUrl) return;

    const loadRoom = async () => {
      try {
        setStatus("Loading room...");
        const { data, error } = await supabase
          .from("rooms")
          .select("*")
          .eq("code", roomCodeFromUrl)
          .single();

        if (error) throw error;

        setRoom(data);
        setStatus("");
      } catch (e) {
        setRoom(null);
        setStatus(
          `Could not load room "${roomCodeFromUrl}": ${String(e?.message ?? e)}`
        );
      }
    };

    loadRoom();
  }, [roomCodeFromUrl]);

  // ✅ When we have BOTH room + user, ensure membership exists
  useEffect(() => {
    if (!room || !user) return;
    ensureMyMembership(room, "guest");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, user?.id]);

  // Clean URL after Stripe return
  useEffect(() => {
    if (!sessionIdFromUrl) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("session_id")) {
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", url.toString());
    }
  }, [sessionIdFromUrl]);

  const signOut = async () => {
    setStatus("");
    try {
      await supabase.auth.signOut();
      window.location.reload();
    } catch (e) {
      setStatus(`Sign out failed: ${String(e?.message ?? e)}`);
    }
  };

  const requireAuth = (actionName = "do that") => {
    if (!user) {
      setStatus(`You must be signed in to ${actionName}.`);
      return false;
    }
    return true;
  };

  const copyShareLink = async () => {
    try {
      if (!room?.code) return;

      const url = new URL(window.location.href);
      url.searchParams.set("room", room.code);
      url.searchParams.delete("session_id");
      url.searchParams.delete("checkout");

      const share = url.toString();

      try {
        await navigator.clipboard.writeText(share);
        setStatus("Share link copied!");
        setTimeout(() => setStatus(""), 1200);
      } catch {
        window.prompt("Copy this link:", share);
      }
    } catch (e) {
      console.warn("copyShareLink failed:", e);
    }
  };

  const Header = () => (
    <div style={styles.header}>
      <div>
        <div style={styles.brand}>FRNDPLAY</div>
        <div style={styles.sub}>Create a room or join with a code.</div>
      </div>

      <div style={styles.headerRight}>
        {user ? (
          <>
            <div style={styles.userPill} title={user.email || user.id}>
              {user.email ? user.email : user.id}
            </div>
            <button onClick={signOut} style={styles.secondaryBtn}>
              Sign Out
            </button>
          </>
        ) : (
          <div style={{ opacity: 0.8, fontWeight: 700 }}>Not signed in</div>
        )}
      </div>
    </div>
  );

  if (authLoading) {
    return (
      <div style={styles.page}>
        <Header />
        <div style={styles.card}>Loading...</div>
      </div>
    );
  }

  const isSharedLinkFlow = Boolean(roomCodeFromUrl);

  // ✅ HARD GATE: if a room is loaded but user is not signed in, DO NOT show RoomView
  if (room && !user) {
    return (
      <div style={styles.page}>
        <Header />
        {status ? <div style={styles.status}>{status}</div> : null}

        <div style={styles.roomBar}>
          <div>
            <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -0.5 }}>
              Room
            </div>
            <div style={{ marginTop: 6, fontSize: 18 }}>
              <b>Code:</b> {room.code}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={copyShareLink} style={styles.secondaryBtn}>
              Copy Share Link
            </button>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={{ margin: 0 }}>Sign in to join</h2>
          <div style={{ opacity: 0.8, marginTop: 6 }}>
            You’re opening a shared room link for <b>{room.code}</b>. Sign in to
            join this room.
          </div>
          <div style={{ marginTop: 14 }}>
            <Auth />
          </div>
        </div>
      </div>
    );
  }

  // Room screen (signed in)
  if (room && user) {
    return (
      <div style={styles.page}>
        <Header />
        {status ? <div style={styles.status}>{status}</div> : null}

        <div style={styles.roomBar}>
          <div>
            <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -0.5 }}>
              Room
            </div>
            <div style={{ marginTop: 6, fontSize: 18 }}>
              <b>Code:</b> {room.code}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={copyShareLink} style={styles.secondaryBtn}>
              Copy Share Link
            </button>
          </div>
        </div>

        <RoomView
          room={room}
          setRoom={setRoom}
          user={user}
          onLeave={async () => {
            try {
              if (user?.id && room?.id) {
                await supabase
                  .from("room_members")
                  .delete()
                  .eq("room_id", room.id)
                  .eq("user_id", user.id);
              }
            } catch (e) {
              console.warn("leave membership delete failed:", e);
            }

            setRoom(null);

            const url = new URL(window.location.href);
            if (url.searchParams.has("room")) url.searchParams.delete("room");
            if (url.searchParams.has("session_id"))
              url.searchParams.delete("session_id");
            if (url.searchParams.has("checkout"))
              url.searchParams.delete("checkout");
            window.history.replaceState({}, "", url.toString());
          }}
        />
      </div>
    );
  }

  // Lobby
  return (
    <div style={styles.page}>
      <Header />
      {status ? <div style={styles.status}>{status}</div> : null}

      <div style={styles.card}>
        <h2 style={{ margin: 0 }}>Sign in</h2>
        <div style={{ opacity: 0.8, marginTop: 6 }}>
          Sign in to create rooms, join rooms, and add songs.
        </div>
        <div style={{ marginTop: 14 }}>
          <Auth />
        </div>
      </div>

      {/* Hide Create/Join if ?room= exists */}
      {!isSharedLinkFlow ? (
        <>
          <div style={styles.card}>
            <h2 style={{ marginTop: 0 }}>Create a room</h2>

            <CreateRoom
              user={user}
              setRoom={async (r) => {
                if (!requireAuth("create a room")) return;

                setRoom(r);

                if (r?.code) {
                  const url = new URL(window.location.href);
                  url.searchParams.set("room", r.code);
                  window.history.replaceState({}, "", url.toString());
                }

                await ensureMyMembership(r, "host");
              }}
            />
          </div>

          <div style={styles.card}>
            <h2 style={{ marginTop: 0 }}>Join a room</h2>

            <JoinRoom
              user={user}
              setRoom={async (r) => {
                setRoom(r);

                if (r?.code) {
                  const url = new URL(window.location.href);
                  url.searchParams.set("room", r.code);
                  window.history.replaceState({}, "", url.toString());
                }

                await ensureMyMembership(r, "guest");
              }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

const styles = {
  page: { maxWidth: 900, margin: "40px auto", padding: "0 16px" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 18,
  },
  brand: { fontSize: 52, fontWeight: 900, letterSpacing: -1, lineHeight: 1 },
  sub: { marginTop: 8, opacity: 0.75, fontSize: 16 },
  headerRight: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  userPill: {
    padding: "8px 10px",
    borderRadius: 999,
    border: "1px solid #e5e5e5",
    background: "#fafafa",
    fontWeight: 800,
    maxWidth: 320,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
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
  secondaryBtn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
    fontWeight: 800,
  },
  roomBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
    padding: 16,
    marginBottom: 12,
    borderRadius: 14,
    border: "1px solid #e9e9e9",
    background: "white",
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  },
};
