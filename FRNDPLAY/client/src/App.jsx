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

function getRoomDataFromUrl() {
  const params = new URLSearchParams(window.location.search);

  return {
    room: (params.get("room") || "").trim().toUpperCase(),
    name: (params.get("name") || "").trim(),
  };
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
const initialData = getRoomDataFromUrl();

const [roomCode, setRoomCode] = useState(initialData.room);  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState(
    localStorage.getItem("frndplay_display_name") || ""
  );

  useEffect(() => {
const syncRoomCodeFromUrl = () => {
  const data = getRoomDataFromUrl();
  setRoomCode(data.room);

  if (data.name) {
    setDisplayName(data.name);
    localStorage.setItem("frndplay_display_name", data.name);
  }
};    syncRoomCodeFromUrl();
    window.addEventListener("popstate", syncRoomCodeFromUrl);
    return () => window.removeEventListener("popstate", syncRoomCodeFromUrl);
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

  const name = displayName.trim();

  window.location.assign(
    `/?room=${encodeURIComponent(normalized)}&name=${encodeURIComponent(name)}`
  );
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

      const { error } = await supabase.from("rooms").insert([
        {
          code,
          owner_id: session.user.id,
        },
      ]);

      if (error) throw error;

      goToRoom(code);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to create room.");
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) return null;

  if (roomCode) {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <TopBar
            session={session}
            displayName={displayName}
            saveDisplayName={saveDisplayName}
            signInWithGoogle={signInWithGoogle}
            signOut={signOut}
          />

          <main style={styles.main}>
            {session ? (
              <RoomView displayName={displayName} />
            ) : (
              <div style={styles.card}>
                <h2 style={styles.heading}>Join Room {roomCode}</h2>
                <button
                  style={styles.primaryButtonLarge}
                  onClick={signInWithGoogle}
                >
                  Continue with Google
                </button>
              </div>
            )}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <TopBar
          session={session}
          displayName={displayName}
          saveDisplayName={saveDisplayName}
          signInWithGoogle={signInWithGoogle}
          signOut={signOut}
        />

        <main style={styles.landingMain}>
          <div style={styles.heroCard}>
  <div style={styles.badge}>Live collaborative music rooms</div>

  <h1 style={styles.heroTitle}>Let everyone help control the music.</h1>

  <p style={styles.heroText}>
    Create a room, share the link, and let friends search, add, vote, and queue songs together in real time.
  </p>

  <input
    value={displayName}
    onChange={(e) => saveDisplayName(e.target.value)}
    placeholder="Your name"
    style={styles.input}
  />

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
    style={{
      ...styles.createButton,
      opacity: busy ? 0.7 : 1,
    }}
    onClick={handleCreateRoom}
    disabled={busy}
  >
    {busy ? "Creating..." : "Create Room"}
  </button>

  <div style={styles.featureList}>
    <span>Search YouTube</span>
    <span>Vote songs up</span>
    <span>Host controls playback</span>
  </div>
</div>
        </main>
      </div>
    </div>
  );
}

function TopBar({
  session,
  displayName,
  saveDisplayName,
  signInWithGoogle,
  signOut,
}) {
  return (
    <header style={styles.topBar}>
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
    </header>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    width: "100%",
    maxWidth: "100%",
    overflowX: "hidden",
    boxSizing: "border-box",
    padding: "12px",
    background: "#0f172a",
    color: "white",
  },

  shell: {
    width: "100%",
    maxWidth: "1100px",
    margin: "0 auto",
    overflowX: "hidden",
    boxSizing: "border-box",
  },

  main: {
    width: "100%",
    maxWidth: "100%",
    overflowX: "hidden",
    boxSizing: "border-box",
  },

  landingMain: {
    width: "100%",
    maxWidth: "100%",
    minHeight: "calc(100vh - 90px)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    overflowX: "hidden",
    boxSizing: "border-box",
  },

  topBar: {
    width: "100%",
    maxWidth: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
    flexWrap: "wrap",
    gap: "10px",
    boxSizing: "border-box",
  },

  brand: {
    fontSize: "22px",
    fontWeight: "bold",
    lineHeight: 1,
    whiteSpace: "nowrap",
  },
  heroCard: {
  width: "100%",
  maxWidth: "460px",
  background: "white",
  color: "#111827",
  padding: "26px",
  borderRadius: "24px",
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  boxSizing: "border-box",
  boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
},

badge: {
  alignSelf: "flex-start",
  background: "#dbeafe",
  color: "#1d4ed8",
  borderRadius: "999px",
  padding: "7px 12px",
  fontSize: "13px",
  fontWeight: 900,
},

heroTitle: {
  margin: "4px 0 0",
  fontSize: "38px",
  lineHeight: 1,
  fontWeight: 950,
  letterSpacing: "-1px",
},

heroText: {
  margin: "0 0 8px",
  color: "#4b5563",
  fontSize: "16px",
  lineHeight: 1.45,
  fontWeight: 600,
},

createButton: {
  width: "100%",
  padding: "12px",
  borderRadius: "10px",
  background: "#111827",
  color: "white",
  border: "none",
  cursor: "pointer",
  boxSizing: "border-box",
  fontWeight: 900,
},

featureList: {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: "8px",
  marginTop: "8px",
  color: "#374151",
  fontSize: "14px",
  fontWeight: 800,
},

  authBlock: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    width: "100%",
    maxWidth: "340px",
    boxSizing: "border-box",
  },

  nameInput: {
    flex: "1 1 160px",
    minWidth: 0,
    padding: "10px",
    borderRadius: "10px",
    border: "none",
    boxSizing: "border-box",
  },

  card: {
    width: "100%",
    maxWidth: "400px",
    background: "white",
    color: "black",
    padding: "20px",
    borderRadius: "16px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    boxSizing: "border-box",
    overflow: "hidden",
  },

  heading: {
    margin: 0,
    lineHeight: 1.15,
  },

  input: {
  width: "100%",
  minWidth: 0,
  padding: "13px 14px",
  borderRadius: "12px",
  border: "1px solid #d1d5db",
  boxSizing: "border-box",
  fontSize: "16px",
  color: "#111827",
  background: "#ffffff",
  caretColor: "#111827",
  WebkitTextFillColor: "#111827",
  outline: "none",
},

  primaryButton: {
    flex: "0 0 auto",
    padding: "10px 12px",
    borderRadius: "10px",
    background: "#2563eb",
    color: "white",
    border: "none",
    cursor: "pointer",
    boxSizing: "border-box",
  },

  primaryButtonLarge: {
    width: "100%",
    padding: "12px",
    borderRadius: "10px",
    background: "#2563eb",
    color: "white",
    border: "none",
    cursor: "pointer",
    boxSizing: "border-box",
  },

  secondaryButton: {
    flex: "0 0 auto",
    padding: "10px 12px",
    borderRadius: "10px",
    background: "#e5e7eb",
    color: "#111827",
    border: "none",
    cursor: "pointer",
    boxSizing: "border-box",
  },
};