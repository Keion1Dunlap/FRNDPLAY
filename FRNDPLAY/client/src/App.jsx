import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import Auth from "./components/Auth";
import CreateRoom from "./components/CreateRoom";
import JoinRoom from "./components/JoinRoom";
import RoomView from "./components/RoomView";
import "./App.css";

export default function App() {
const [session, setSession] = useState(null);
const [displayName, setDisplayName] = useState("");
const [room, setRoom] = useState(null);
const [loading, setLoading] = useState(true);

  const roomCodeFromUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get("room") || "").trim().toUpperCase();
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      setSession(session || null);
      setLoading(false);
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session || null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const savedName = localStorage.getItem("frndplay_display_name");

    if (savedName) {
      setDisplayName(savedName);
    }
  }, []);

  const handleNameChange = (e) => {
    const value = e.target.value;
    setDisplayName(value);
    localStorage.setItem("frndplay_display_name", value);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.assign("/");
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.logo}>FRNDPLAY</h1>
          <p style={styles.subText}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.logo}>FRNDPLAY</h1>
          <p style={styles.subText}>Real-time collaborative music rooms</p>
          <Auth />
        </div>
      </div>
    );
  }
if (room) {
  return <RoomView room={room} displayName={displayName} />;
}
  if (roomCodeFromUrl) {
    return <RoomView displayName={displayName} />;
  }

  return (
    <div style={styles.page}>
      <div style={styles.topBar}>
        <div>
          <h1 style={styles.logoSmall}>FRNDPLAY</h1>
          <p style={styles.topSubText}>Real-time collaborative music rooms</p>
        </div>

        <button style={styles.signOutButton} onClick={handleSignOut}>
          Sign out
        </button>
      </div>

      <main style={styles.heroWrap}>
        <section style={styles.heroCard}>
          <div style={styles.badge}>Live collaborative music rooms</div>

          <h2 style={styles.heroTitle}>
            Let everyone help control the music.
          </h2>

          <p style={styles.heroText}>
            Create a room, share the link, and let friends search, add, vote,
            and queue songs together in real time.
          </p>

          <input
            value={displayName}
            onChange={handleNameChange}
            placeholder="Your name"
            style={styles.input}
          />

          <div style={styles.roomActions}>
<JoinRoom
  user={session.user}
  setRoom={setRoom}
  displayName={displayName}
/></div>

          <div style={styles.featureList}>
            <div>🎵 Live queue sync</div>
            <div>👍 Song voting</div>
            <div>📱 Mobile optimized</div>
          </div>
        </section>
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    width: "100%",
    background:
      "radial-gradient(circle at top left, #16357a 0%, #0a1b4d 35%, #031031 70%, #020816 100%)",
    color: "white",
    padding: "24px",
    boxSizing: "border-box",
  },

  card: {
    width: "100%",
    maxWidth: "460px",
    margin: "90px auto",
    background: "rgba(255,255,255,0.96)",
    color: "#111827",
    borderRadius: "28px",
    padding: "28px",
    boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
  },

  logo: {
    margin: 0,
    fontSize: "2.5rem",
    fontWeight: 950,
    letterSpacing: "-0.04em",
    color: "#111827",
  },

  subText: {
    marginTop: "8px",
    color: "#4b5563",
    fontWeight: 700,
  },

  topBar: {
    width: "100%",
    maxWidth: "1100px",
    margin: "0 auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
  },

  logoSmall: {
    margin: 0,
    fontSize: "1.9rem",
    fontWeight: 950,
    letterSpacing: "-0.04em",
  },

  topSubText: {
    margin: "4px 0 0",
    opacity: 0.9,
    fontWeight: 700,
  },

  signOutButton: {
    border: "none",
    borderRadius: "14px",
    padding: "12px 18px",
    fontWeight: 900,
    fontSize: "0.95rem",
    cursor: "pointer",
    background: "white",
    color: "#111827",
  },

  heroWrap: {
    width: "100%",
    maxWidth: "1100px",
    margin: "70px auto 0",
    display: "flex",
    justifyContent: "flex-start",
  },

  heroCard: {
    width: "100%",
    maxWidth: "500px",
    background: "rgba(255,255,255,0.97)",
    color: "#111827",
    borderRadius: "30px",
    padding: "30px",
    boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
  },

  badge: {
    display: "inline-flex",
    background: "#dbeafe",
    color: "#1d4ed8",
    padding: "9px 13px",
    borderRadius: "999px",
    fontWeight: 900,
    fontSize: "0.9rem",
    marginBottom: "18px",
  },

  heroTitle: {
    margin: 0,
    fontSize: "2rem",
    lineHeight: 1.05,
    letterSpacing: "-0.04em",
    fontWeight: 950,
  },

  heroText: {
    color: "#374151",
    fontWeight: 650,
    lineHeight: 1.5,
    marginTop: "16px",
    marginBottom: "22px",
  },

  input: {
    width: "100%",
    height: "52px",
    border: "1px solid #d1d5db",
    borderRadius: "14px",
    padding: "0 14px",
    fontSize: "1rem",
    fontWeight: 700,
    color: "#111827",
    background: "white",
    boxSizing: "border-box",
    marginBottom: "12px",
  },

  roomActions: {
    display: "grid",
    gap: "12px",
  },

  featureList: {
    display: "grid",
    gap: "10px",
    marginTop: "22px",
    color: "#374151",
    fontWeight: 900,
  },
};