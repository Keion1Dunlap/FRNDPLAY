// client/src/App.jsx
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { supabase } from "./supabase";

import Auth from "./components/Auth";
import CreateRoom from "./components/CreateRoom";
import JoinRoom from "./components/JoinRoom";
import RoomView from "./components/RoomView";

function getRoomCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room");
  return room ? String(room).trim().toUpperCase() : "";
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [room, setRoom] = useState(null);
  const [roomCode, setRoomCode] = useState("");

  const urlRoomCode = useMemo(() => getRoomCodeFromUrl(), []);

  // --- Load session + subscribe ---
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data?.session ?? null);
      setAuthLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  // --- Auto anonymous sign-in when a room link is opened and user isn't signed in ---
  useEffect(() => {
    if (authLoading) return;

    // Only do this if they arrived via a room link
    if (!urlRoomCode) return;

    // Already signed in -> nothing to do
    if (session) return;

    (async () => {
      try {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        setSession(data?.session ?? null);
      } catch (e) {
        console.error("Anonymous sign-in failed:", e);
        // Fall back to showing Auth component
      }
    })();
  }, [authLoading, session, urlRoomCode]);

  // --- If URL has room=CODE, attempt to join it automatically ---
  useEffect(() => {
    if (!urlRoomCode) return;
    setRoomCode(urlRoomCode);
  }, [urlRoomCode]);

  // --- Join room by code ---
  const joinRoomByCode = async (code) => {
    const cleaned = String(code || "").trim().toUpperCase();
    if (!cleaned) return;

    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("code", cleaned)
      .single();

    if (error || !data) {
      alert(error?.message || "Room not found");
      return;
    }

    setRoom(data);
    setRoomCode(cleaned);

    // Keep URL shareable
    const params = new URLSearchParams(window.location.search);
    params.set("room", cleaned);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  };

  // Auto-join when we have a room code
  useEffect(() => {
    if (!roomCode) return;
    if (room) return;
    joinRoomByCode(roomCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  const onLeave = () => {
    setRoom(null);
    setRoomCode("");

    const params = new URLSearchParams(window.location.search);
    params.delete("room");
    params.delete("checkout");
    params.delete("session_id");
    window.history.replaceState({}, "", window.location.pathname + (params.toString() ? `?${params}` : ""));
  };

  // Keep URL updated any time room changes (create/join)
  useEffect(() => {
    if (!room?.code) return;
    const params = new URLSearchParams(window.location.search);
    params.set("room", room.code);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }, [room]);

  // --- UI ---
  if (authLoading) {
    return (
      <div style={{ padding: 28 }}>
        <h1 style={{ margin: 0 }}>FRNDPLAY</h1>
        <p style={{ color: "#666" }}>Loading…</p>
      </div>
    );
  }

  // If no session and we’re NOT trying to join a room link, show normal Auth UI
  if (!session && !urlRoomCode) {
    return (
      <div style={{ padding: 28 }}>
        <h1 style={{ margin: 0 }}>FRNDPLAY</h1>
        <p style={{ color: "#666" }}>Sign in to create rooms and host parties.</p>
        <Auth />
      </div>
    );
  }

  // If we have a room loaded, show room view
  if (room) {
    return (
      <RoomView
        room={room}
        setRoom={setRoom}
        onLeave={onLeave}
        user={session?.user ?? null}
      />
    );
  }

  // Otherwise show create/join
  return (
    <div style={{ padding: 28, maxWidth: 900 }}>
      <h1 style={{ margin: 0 }}>FRNDPLAY</h1>

      {!session ? (
        <p style={{ color: "#666" }}>
          You’re not signed in. (If your auth UI is elsewhere, open it and sign in.)
        </p>
      ) : (
        <p style={{ color: "#666" }}>Signed in.</p>
      )}

      <div style={{ display: "grid", gap: 18, marginTop: 18 }}>
        {/* ✅ Pass setRoom the way CreateRoom expects */}
        <CreateRoom
          user={session?.user ?? null}
          setRoom={(newRoom) => {
            setRoom(newRoom);
            setRoomCode(newRoom.code);

            const params = new URLSearchParams(window.location.search);
            params.set("room", newRoom.code);
            window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
          }}
        />

        {/* ✅ Pass setRoom the way JoinRoom expects */}
        <JoinRoom
          setRoom={(joinedRoom) => {
            setRoom(joinedRoom);
            setRoomCode(joinedRoom.code);

            const params = new URLSearchParams(window.location.search);
            params.set("room", joinedRoom.code);
            window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
          }}
          // If your JoinRoom also needs user, it won't hurt to pass it:
          user={session?.user ?? null}
        />
      </div>
    </div>
  );
}
