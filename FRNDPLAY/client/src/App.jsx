import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import RoomView from "./components/RoomView";

function makeCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) {
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
      } = await supabase.auth.getSession();

      if (!mounted) return;

      setSession(session);
      setAuthLoading(false);
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
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
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    window.location.assign(`/?room=${encodeURIComponent(normalized)}`);
  };

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const handleJoinRoom = () => {
    if (!joinCode.trim()) {
      alert("Enter a room code.");
      return;
    }
    goToRoom(joinCode);
  };

  const handleCreateRoom = async () => {
    if (!session?.user?.id) {
      alert("Sign in first.");
      return;
    }

    setBusy(true);

    try {
      const code = makeCode();

      await supabase.from("rooms").insert([
        {
          code,
          owner_id: session.user.id,
        },
      ]);

      goToRoom(code);
    } catch (err) {
      console.error(err);
      alert("Failed to create room.");
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) return null;

  // ✅ ROOM VIEW
  if (roomCode) {
    return (
      <div style={styles.page}>
        <div style={styles.topBar}>
          <div style={styles.brand}>FRNDPLAY</div>

          <div style={styles.authBlock}>
            {session ? (
              <>
                <input
                  value={displayName}
                  onChange={(e) => saveDisplayName(e.target.value)}
                  placeholder="Name"
                  style={styles.nameInput}
                />

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

        {session ? (
          <RoomView displayName={displayName} />
        ) : (
          <div style={styles.card}>
            <h2>Join Room {roomCode}</h2>
            <button style={styles.primaryButtonLarge} onClick={signInWithGoogle}>
              Continue with Google
            </button>
          </div>
        )}
      </div>
    );
  }

  // ✅ LANDING
  return (
    <div style={styles.page}>
      <div style={styles.topBar}>
        <div style={styles.brand}>FRNDPLAY</div>

        <div style={styles.authBlock}>
          {session ? (
            <>
              <input
                value={displayName}
                onChange={(e) => saveDisplayName(e.target.value)}
                placeholder="Name"
                style={styles.nameInput}
              />

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
        <h1>Welcome to FRNDPLAY</h1>

        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          placeholder="Room Code"
          style={styles.input}
        />

        <button style={styles.primaryButtonLarge} onClick={handleJoinRoom}>
          Join Room
        </button>

        <button
          style={styles.primaryButtonLarge}
          onClick={handleCreateRoom}
          disabled={busy}
        >
          {busy ? "Creating..." : "Create Room"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: "16px",
    background: "#0f172a",
    color: "white",
  },

  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
    flexWrap: "wrap",
    gap: "10px",
  },

  brand: {
    fontSize: "22px",
    fontWeight: "bold",
  },

  authBlock: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    width: "100%",
    maxWidth: "320px",
  },

  nameInput: {
    flex: 1,
    padding: "10px",
    borderRadius: "10px",
    border: "none",
  },

  card: {
    background: "white",
    color: "black",
    padding: "20px",
    borderRadius: "16px",
    maxWidth: "400px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },

  input: {
    padding: "10px",
    borderRadius: "10px",
    border: "1px solid #ccc",
  },

  primaryButton: {
    padding: "10px",
    borderRadius: "10px",
    background: "#2563eb",
    color: "white",
    border: "none",
    cursor: "pointer",
  },

  primaryButtonLarge: {
    padding: "12px",
    borderRadius: "10px",
    background: "#2563eb",
    color: "white",
    border: "none",
    cursor: "pointer",
  },

  secondaryButton: {
    padding: "10px",
    borderRadius: "10px",
    background: "#e5e7eb",
    border: "none",
    cursor: "pointer",
  },
};