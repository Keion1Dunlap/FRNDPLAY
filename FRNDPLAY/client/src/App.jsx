import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import RoomView from "./components/RoomView";

function makeCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";

  for (let i = 0; i < len; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }

  return out;
}

function getRoomCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return (params.get("room") || "").trim().toUpperCase();
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [roomCode, setRoomCode] = useState(getRoomCodeFromUrl());
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState(
    localStorage.getItem("frndplay_display_name") || ""
  );

  useEffect(() => {
    const syncRoomCodeFromUrl = () => {
      setRoomCode(getRoomCodeFromUrl());
    };

    syncRoomCodeFromUrl();
    window.addEventListener("popstate", syncRoomCodeFromUrl);

    return () => {
      window.removeEventListener("popstate", syncRoomCodeFromUrl);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.error("getSession error:", error.message);
      }

      if (!mounted) return;

      setSession(session);
      setAuthLoading(false);
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const saveDisplayName = (value) => {
    setDisplayName(value);
    localStorage.setItem("frndplay_display_name", value);
  };

  const goToRoom = (code) => {
    const normalized = String(code || "").trim().toUpperCase();
    if (!normalized) return;

    window.location.assign(`/?room=${encodeURIComponent(normalized)}`);
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      console.error("Google login error:", error.message);
      alert(error.message);
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Sign out error:", error.message);
      alert(error.message);
    }
  };

  const handleJoinRoom = () => {
    const normalized = joinCode.trim().toUpperCase();

    if (!normalized) {
      alert("Enter a room code.");
      return;
    }

    goToRoom(normalized);
  };

  const handleCreateRoom = async () => {
    if (!session?.user?.id) {
      alert("Sign in with Google before creating a room.");
      return;
    }

    setBusy(true);

    try {
      let createdRoomCode = null;

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const code = makeCode(6);

        const payload = {
          code,
          owner_id: session.user.id,
          host_user_id: session.user.id,
          host_session_id: crypto?.randomUUID?.() || `${Date.now()}`,
          current_video_id: "",
          current_title: "",
          is_playing: false,
          playback_time: 0,
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase.from("rooms").insert([payload]);

        if (!error) {
          createdRoomCode = code;
          break;
        }

        const message = String(error.message || "").toLowerCase();
        const isCollision =
          message.includes("duplicate") ||
          message.includes("unique") ||
          message.includes("already exists");

        if (!isCollision) throw error;
      }

      if (!createdRoomCode) {
        throw new Error("Could not create a unique room code. Try again.");
      }

      goToRoom(createdRoomCode);
    } catch (err) {
      console.error("Create room error:", err);
      alert(err.message || "Failed to create room.");
    } finally {
      setBusy(false);
    }
  };

  if (roomCode) {
  return (
    <div style={styles.page}>
      <div style={styles.topBar}>
        <div style={styles.brandBlock}>
          <div style={styles.brand}>FRNDPLAY</div>
          <div style={styles.subBrand}>Room: {roomCode}</div>
        </div>

        <div style={styles.authBlock}>
          {session?.user ? (
            <>
              <input
                value={displayName}
                onChange={(e) => saveDisplayName(e.target.value)}
                placeholder="Display name"
                style={styles.nameInput}
                maxLength={24}
              />
              <div style={styles.userText}>
                {displayName.trim() || session.user.email || "Signed in"}
              </div>
              <button style={styles.secondaryButton} onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <button style={styles.primaryButton} onClick={signInWithGoogle}>
              Continue with Google
            </button>
          )}
        </div>
      </div>

      {session?.user ? (
        <RoomView displayName={displayName} />
      ) : (
        <div style={styles.card}>
          <h1 style={styles.title}>Join Room {roomCode}</h1>
          <p style={styles.text}>
            Sign in with Google to join this FRNDPLAY room and add songs to the queue.
          </p>

          <button style={styles.primaryButtonLarge} onClick={signInWithGoogle}>
            Continue with Google
          </button>
        </div>
      )}
    </div>
  );
}

  if (roomCode) {
    return (
      <div style={styles.page}>
        <div style={styles.topBar}>
          <div style={styles.brandBlock}>
            <div style={styles.brand}>FRNDPLAY</div>
            <div style={styles.subBrand}>Room: {roomCode}</div>
          </div>

          <div style={styles.authBlock}>
            {session?.user ? (
              <>
                <input
                  value={displayName}
                  onChange={(e) => saveDisplayName(e.target.value)}
                  placeholder="Display name"
                  style={styles.nameInput}
                  maxLength={24}
                />
                <div style={styles.userText}>
                  {displayName.trim() || session.user.email || "Signed in"}
                </div>
                <button style={styles.secondaryButton} onClick={signOut}>
                  Sign out
                </button>
              </>
            ) : (
              <button style={styles.primaryButton} onClick={signInWithGoogle}>
                Continue with Google
              </button>
            )}
          </div>
        </div>

        <RoomView displayName={displayName} />
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.topBar}>
        <div style={styles.brandBlock}>
          <div style={styles.brand}>FRNDPLAY</div>
          <div style={styles.subBrand}>Social listening</div>
        </div>

        <div style={styles.authBlock}>
          {session?.user ? (
            <>
              <input
                value={displayName}
                onChange={(e) => saveDisplayName(e.target.value)}
                placeholder="Display name"
                style={styles.nameInput}
                maxLength={24}
              />
              <div style={styles.userText}>
                {displayName.trim() || session.user.email || "Signed in"}
              </div>
              <button style={styles.secondaryButton} onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <button style={styles.primaryButton} onClick={signInWithGoogle}>
              Continue with Google
            </button>
          )}
        </div>
      </div>

      <div style={styles.card}>
        <h1 style={styles.title}>Welcome to FRNDPLAY</h1>
        <p style={styles.text}>
          Create or join a room to start listening together.
        </p>

        <div style={styles.actionsBlock}>
          <div style={styles.sectionTitle}>Join a room</div>

          <div style={styles.row}>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJoinRoom();
              }}
              placeholder="ENTER ROOM CODE"
              style={styles.input}
              maxLength={12}
            />

            <button style={styles.primaryButtonLarge} onClick={handleJoinRoom}>
              Join Room
            </button>
          </div>

          <div style={styles.divider} />

          <div style={styles.sectionTitle}>Create a room</div>

          <p style={styles.helperText}>
            {session?.user
              ? "Create a new listening room and jump straight in."
              : "Sign in with Google to create a room."}
          </p>

          <button
            style={{
              ...styles.primaryButtonLarge,
              ...(busy ? styles.disabledButton : {}),
            }}
            onClick={handleCreateRoom}
            disabled={busy}
          >
            {busy ? "Creating..." : "Create Room"}
          </button>
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
    padding: "24px",
    boxSizing: "border-box",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  topBar: {
    maxWidth: "1450px",
    margin: "0 auto 20px auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
  },
  brandBlock: {
    color: "white",
  },
  brand: {
    fontSize: "2rem",
    fontWeight: 900,
    letterSpacing: "-0.03em",
  },
  subBrand: {
    marginTop: "4px",
    fontSize: "1rem",
    opacity: 0.9,
  },
  authBlock: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
  },
  userText: {
    color: "white",
    fontWeight: 700,
    fontSize: "0.95rem",
  },
  nameInput: {
    border: "1px solid rgba(255,255,255,0.35)",
    borderRadius: "14px",
    padding: "11px 14px",
    fontWeight: 800,
    outline: "none",
    background: "rgba(255,255,255,0.95)",
    color: "#111827",
    maxWidth: "180px",
  },
  card: {
    maxWidth: "760px",
    margin: "60px auto 0 auto",
    background: "rgba(255,255,255,0.97)",
    borderRadius: "28px",
    padding: "32px",
    boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
  },
  title: {
    margin: 0,
    fontSize: "2.4rem",
    fontWeight: 900,
    color: "#111827",
    lineHeight: 1.05,
  },
  text: {
    margin: "16px 0 0 0",
    color: "#4b5563",
    fontSize: "1.05rem",
    lineHeight: 1.6,
    fontWeight: 500,
  },
  actionsBlock: {
    marginTop: "28px",
  },
  sectionTitle: {
    fontSize: "1.1rem",
    fontWeight: 900,
    color: "#111827",
    marginBottom: "12px",
  },
  row: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    alignItems: "center",
  },
  input: {
    flex: 1,
    minWidth: "240px",
    borderRadius: "14px",
    border: "1px solid #d1d5db",
    padding: "13px 15px",
    fontSize: "1rem",
    outline: "none",
    background: "white",
    textTransform: "uppercase",
  },
  divider: {
    height: "1px",
    background: "#e5e7eb",
    margin: "24px 0",
  },
  helperText: {
    margin: "0 0 14px 0",
    color: "#6b7280",
    fontSize: "0.95rem",
    lineHeight: 1.5,
    fontWeight: 500,
  },
  primaryButton: {
    border: "none",
    borderRadius: "14px",
    padding: "12px 18px",
    background: "#111827",
    color: "white",
    fontWeight: 900,
    fontSize: "0.98rem",
    cursor: "pointer",
  },
  primaryButtonLarge: {
    border: "none",
    borderRadius: "16px",
    padding: "14px 22px",
    background: "#111827",
    color: "white",
    fontWeight: 900,
    fontSize: "1rem",
    cursor: "pointer",
  },
  secondaryButton: {
    border: "none",
    borderRadius: "14px",
    padding: "12px 18px",
    background: "#e5e7eb",
    color: "#111827",
    fontWeight: 900,
    fontSize: "0.98rem",
    cursor: "pointer",
  },
  disabledButton: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
};