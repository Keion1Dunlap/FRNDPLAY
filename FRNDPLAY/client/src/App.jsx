import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import RoomView from "./components/RoomView";

const POST_LOGIN_REDIRECT_KEY = "frndplay_post_login_redirect";

function getRoomCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return (params.get("room") || "").trim().toUpperCase();
}

function getCurrentRelativeUrl() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function restoreSavedRedirectIfNeeded(session) {
  if (!session?.user) return false;

  const savedRedirect = localStorage.getItem(POST_LOGIN_REDIRECT_KEY);
  if (!savedRedirect) return false;

  const currentRelative = getCurrentRelativeUrl();

  if (currentRelative !== savedRedirect) {
    window.location.replace(savedRedirect);
    return true;
  }

  localStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
  return false;
}

function makeCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [roomCode, setRoomCode] = useState(getRoomCodeFromUrl());
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);

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
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("getSession error:", error);
        }

        if (!mounted) return;

        setSession(session ?? null);

        const redirected = restoreSavedRedirectIfNeeded(session);
        if (redirected) return;

        setAuthLoading(false);
      } catch (err) {
        console.error("loadSession unexpected error:", err);
        if (mounted) setAuthLoading(false);
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession ?? null);

      if (event === "SIGNED_IN") {
        const redirected = restoreSavedRedirectIfNeeded(nextSession);
        if (redirected) return;
      }

      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const goToRoom = (code) => {
    const normalized = String(code || "").trim().toUpperCase();
    if (!normalized) return;

    const nextUrl = `/?room=${encodeURIComponent(normalized)}`;
    window.location.assign(nextUrl);
  };

  const signInWithGoogle = async () => {
    try {
      const currentRelativeUrl = getCurrentRelativeUrl();
      localStorage.setItem(POST_LOGIN_REDIRECT_KEY, currentRelativeUrl);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });

      if (error) {
        console.error("Google sign-in error:", error);
        alert(error.message);
      }
    } catch (err) {
      console.error("Google sign-in unexpected error:", err);
      alert(err.message || "Google sign-in failed.");
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Sign-out error:", error);
        alert(error.message);
      }
    } catch (err) {
      console.error("Sign-out unexpected error:", err);
      alert(err.message || "Sign-out failed.");
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
          current_video_id: "",
          current_title: "",
          is_playing: false,
          playback_time: 0,
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

        if (!isCollision) {
          throw error;
        }
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

  if (authLoading) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>FRNDPLAY</h1>
          <p style={styles.text}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.topBar}>
        <div style={styles.brandBlock}>
          <div style={styles.brand}>FRNDPLAY</div>
          <div style={styles.subBrand}>
            {roomCode ? `Room: ${roomCode}` : "Social listening"}
          </div>
        </div>

        <div style={styles.authBlock}>
          {session?.user ? (
            <>
              <div style={styles.userText}>{session.user.email || "Signed in"}</div>
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

      {roomCode ? (
        <RoomView />
      ) : (
        <div style={styles.card}>
          <h1 style={styles.title}>Welcome to FRNDPLAY</h1>
          <p style={styles.text}>
            Create a room or join a room to start listening together.
          </p>

          <div style={styles.actionsBlock}>
            <div style={styles.sectionTitle}>Join a room</div>
            <div style={styles.row}>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleJoinRoom();
                }}
                placeholder="Enter room code"
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
      )}
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
    fontWeight: 600,
    fontSize: "0.95rem",
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
    fontWeight: 800,
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
    fontWeight: 800,
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
    fontWeight: 800,
    fontSize: "0.98rem",
    cursor: "pointer",
  },
  disabledButton: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
};