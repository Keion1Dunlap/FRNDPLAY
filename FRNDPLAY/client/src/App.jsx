import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import Auth from "./components/Auth";
import CreateRoom from "./components/CreateRoom";
import JoinRoom from "./components/JoinRoom";
import RoomView from "./components/RoomView";
import "./App.css";

function getRoomCodeFromUrl() {
  try {
    const url = new URL(window.location.href);
    return (
      url.searchParams.get("room") ||
      url.searchParams.get("code") ||
      url.searchParams.get("roomCode") ||
      ""
    )
      .toUpperCase()
      .trim();
  } catch {
    return "";
  }
}

function getDisplayName(email) {
  const em = String(email || "").trim().toLowerCase();
  if (!em) return "Guest";
  return em.includes("@") ? em.split("@")[0] : em;
}

export default function App() {
  const roomCode = useMemo(() => getRoomCodeFromUrl(), []);
  const [session, setSession] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    let alive = true;

    async function init() {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setSession(data?.session ?? null);
      setLoadingAuth(false);
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null);
      setLoadingAuth(false);
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      const url = new URL(window.location.href);
      window.location.href = url.searchParams.get("room")
        ? `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(
            url.searchParams.get("room")
          )}`
        : `${window.location.origin}${window.location.pathname}`;
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  };

  if (roomCode) {
    return <RoomView />;
  }

  return (
    <div className="app-shell">
      <div className="app-bg-orb app-bg-orb-1" />
      <div className="app-bg-orb app-bg-orb-2" />

      <main className="landing-wrap">
        <section className="hero-card">
          <div className="hero-topbar">
            <div className="brand-lockup">
              <div className="brand-mark">⚡</div>
              <div>
                <div className="brand-name">FRNDPLAY</div>
                <div className="brand-sub">
                  Real-time shared listening rooms
                </div>
              </div>
            </div>

            <div className="session-pill">
              {loadingAuth ? (
                <span>Checking session...</span>
              ) : session?.user ? (
                <>
                  <span className="session-pill-dot" />
                  <span>Signed in as {getDisplayName(session.user.email)}</span>
                </>
              ) : (
                <span>Not signed in</span>
              )}
            </div>
          </div>

          <div className="hero-grid">
            <div className="hero-copy">
              <div className="eyebrow">Listen together from anywhere</div>

              <h1 className="hero-title">
                Build a room. Share a link. Stay in sync.
              </h1>

              <p className="hero-text">
                FRNDPLAY lets groups listen to the same track at the same time
                with host-controlled playback, a collaborative queue, live room
                chat, and real-time presence across devices.
              </p>

              <div className="hero-bullets">
                <div className="hero-bullet">Host-controlled playback</div>
                <div className="hero-bullet">Shared queue with live updates</div>
                <div className="hero-bullet">Room chat and active listeners</div>
              </div>
            </div>

            <div className="hero-preview">
              <div className="preview-window">
                <div className="preview-header">
                  <span className="preview-dot" />
                  <span className="preview-dot" />
                  <span className="preview-dot" />
                </div>

                <div className="preview-body">
                  <div className="preview-now-playing">
                    <div className="preview-label">Now playing</div>
                    <div className="preview-track">Migos - Need It</div>
                    <div className="preview-meta">Host synced • 4 listeners</div>
                  </div>

                  <div className="preview-player" />

                  <div className="preview-controls">
                    <button type="button">Previous</button>
                    <button type="button">Play</button>
                    <button type="button">Pause</button>
                    <button type="button">Skip</button>
                  </div>

                  <div className="preview-queue-card">
                    <div className="preview-thumb" />
                    <div className="preview-queue-text">
                      <div className="preview-queue-title">
                        Shared queue with titles and artwork
                      </div>
                      <div className="preview-queue-meta">
                        Added by friends in real time
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="actions-grid">
          <div className="action-card">
            <div className="action-card-header">
              <h2>Create a room</h2>
              <p>Start a new listening session and become the host.</p>
            </div>
            <CreateRoom />
          </div>

          <div className="action-card">
            <div className="action-card-header">
              <h2>Join a room</h2>
              <p>Jump into an existing room with a code or shared link.</p>
            </div>
            <JoinRoom />
          </div>
        </section>

        <section className="auth-card">
          <div className="action-card-header">
            <h2>Account access</h2>
            <p>
              Sign in with a magic link so your rooms, queue actions, and chat
              identity stay consistent across devices.
            </p>
          </div>

          <Auth />

          {session?.user ? (
            <div className="auth-footer">
              <div className="signed-in-note">
                Signed in as <b>{session.user.email}</b>
              </div>
              <button className="secondary-btn" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}