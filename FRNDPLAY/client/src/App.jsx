import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { usePostHog } from "@posthog/react";
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
  const initialData = getRoomDataFromUrl();
  const posthog = usePostHog();
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [roomCode, setRoomCode] = useState(initialData.room);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [displayName, setDisplayName] = useState(
    initialData.name || localStorage.getItem("frndplay_display_name") || ""
  );

  useEffect(() => {
    const syncRoomCodeFromUrl = () => {
      const data = getRoomDataFromUrl();
      setRoomCode(data.room);

      if (data.name) {
        setDisplayName(data.name);
        localStorage.setItem("frndplay_display_name", data.name);
      }
    };

    syncRoomCodeFromUrl();
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
  useEffect(() => {
  if (authLoading || !session) return;

  const savedUrl = localStorage.getItem("frndplay_after_login_url");
  if (!savedUrl) return;

  localStorage.removeItem("frndplay_after_login_url");

  const saved = new URL(savedUrl);
  const room = saved.searchParams.get("room");
  const name = saved.searchParams.get("name");

  if (room) {
    const nextUrl = `/?room=${encodeURIComponent(room)}${
      name ? `&name=${encodeURIComponent(name)}` : ""
    }`;

    window.location.replace(nextUrl);
  }
}, [authLoading, session]);

  const saveDisplayName = (value) => {
    setDisplayName(value);
    localStorage.setItem("frndplay_display_name", value);
  };

  const goToRoom = (code) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;

    const name = displayName.trim();

    window.location.assign(
      `/?room=${encodeURIComponent(normalized)}&name=${encodeURIComponent(
        name
      )}`
    );
  };

  const signInWithGoogle = async () => {
  const currentUrl = window.location.href;
  localStorage.setItem("frndplay_after_login_url", currentUrl);

  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
    },
  });
};

const signOut = async () => {
  try {
    setSigningOut(true);

    localStorage.removeItem("frndplay_after_login_url");
    localStorage.removeItem("frndplay_session_id");

    setSession(null);
    setRoomCode("");

    await supabase.auth.signOut({ scope: "local" });

    window.location.assign("/");
  } catch (err) {
    console.error("signOut error:", err);

    setSession(null);
    setRoomCode("");

    window.location.assign("/");
  }
};

  const handleJoinRoom = () => {
    if (!displayName.trim()) {
      alert("Enter your name.");
      return;
    }

    if (!joinCode.trim()) {
      alert("Enter a room code.");
      return;
    }

    goToRoom(joinCode);
  };

  const handleCreateRoom = async () => {
    if (!displayName.trim()) {
      alert("Enter your name.");
      return;
    }

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
  safe_mode: false,
  ended: false,
}
      ]);

      if (error) throw error;

posthog.capture("room_created", {
  room_code: code,
});

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
            signingOut={signingOut}
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

                <p style={styles.cardText}>
                  Sign in to join this room and add songs to the live queue.
                </p>

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
          signingOut={signingOut}
          displayName={displayName}
          saveDisplayName={saveDisplayName}
          signInWithGoogle={signInWithGoogle}
          signOut={signOut}
        />

        <main style={styles.landingMain}>
          <div style={styles.heroCard}>
            <div style={styles.badge}>Live collaborative music rooms</div>

            <h1 style={styles.heroTitle}>
              Let everyone help control the music.
            </h1>

            <p style={styles.heroText}>
              Create a room, share the link, and let friends search, add, vote,
              and queue songs together in real time.
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

            <div style={styles.featureRow}>
              <span>🎵 Live queue sync</span>
              <span>👍 Song voting</span>
              <span>📱 Mobile optimized</span>
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
  signingOut,
}) {
  return (
    <header style={styles.topBar}>
      <div>
        <div style={styles.brand}>FRNDPLAY</div>
        <div style={styles.brandSub}>Real-time collaborative music rooms</div>
      </div>

      <div style={styles.authBlock}>
        {session ? (
          <>
            <input
              value={displayName}
              onChange={(e) => saveDisplayName(e.target.value)}
              placeholder="Name"
              style={styles.nameInput}
            />

            <button
  style={{
    ...styles.secondaryButton,
    opacity: signingOut ? 0.7 : 1,
  }}
  onClick={signOut}
  disabled={signingOut}
>
  {signingOut ? "Signing out..." : "Sign out"}
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
    paddingTop: "40px",
    paddingBottom: "40px",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
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
    fontSize: "30px",
    fontWeight: 950,
    lineHeight: 1,
    whiteSpace: "nowrap",
    letterSpacing: "-0.5px",
  },

  brandSub: {
    fontSize: "13px",
    color: "rgba(255,255,255,0.7)",
    marginTop: "4px",
    fontWeight: 600,
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
    color: "#111827",
    background: "#ffffff",
    WebkitTextFillColor: "#111827",
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
    fontSize: "30px",
    lineHeight: 1.05,
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

  cardText: {
    margin: 0,
    color: "#4b5563",
    fontWeight: 600,
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
    fontWeight: 800,
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
    fontWeight: 900,
    fontSize: "16px",
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
    fontSize: "16px",
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
    fontWeight: 800,
  },

  featureRow: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginTop: "10px",
    color: "#4b5563",
    fontWeight: 700,
    fontSize: "14px",
  },
};