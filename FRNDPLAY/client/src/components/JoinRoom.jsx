// client/src/components/JoinRoom.jsx
import { useState } from "react";
import { supabase } from "../supabase";

export default function JoinRoom({ user, setRoom }) {
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const joinRoom = async () => {
    setErrorMsg("");
    setLoading(true);

    try {
      console.log("JoinRoom user:", user);
console.log("JoinRoom user prop:", user);

const {
  data: { session },
} = await supabase.auth.getSession();

console.log("JoinRoom session:", session);

const activeUser = user || session?.user;

if (!activeUser?.id) {
  setErrorMsg("Sign in to join this room.");
  return;
}
      const trimmed = String(code || "").trim().toUpperCase();
      const name = String(displayName || "").trim();

      if (!name) throw new Error("Enter your name.");
      if (!trimmed) throw new Error("Enter a room code.");

      const { data: room, error: roomErr } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", trimmed)
        .single();

      if (roomErr) throw roomErr;
      if (!room?.id) throw new Error("Room not found.");

      const { error: memberErr } = await supabase
        .from("room_members")
        .upsert(
{ room_id: room.id, user_id: activeUser.id, role: "guest" },          { onConflict: "room_id,user_id" }
        );

      if (memberErr && memberErr.code !== "23505") throw memberErr;

      const url = new URL(window.location.href);
      url.searchParams.set("room", trimmed);
      url.searchParams.set("name", name);
      url.searchParams.delete("session_id");
      url.searchParams.delete("checkout");
      window.history.replaceState({}, "", url.toString());

      setRoom(room);
    } catch (e) {
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>Join a room</h2>
      <p style={styles.subtitle}>Enter your name and the room code to join the queue.</p>

      <div style={styles.form}>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
          style={styles.input}
          disabled={loading}
        />

        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Room code"
          style={styles.input}
          disabled={loading}
        />

        <button onClick={joinRoom} disabled={loading} style={styles.primaryBtn}>
          {loading ? "Joining..." : "Join Room"}
        </button>
      </div>

      <div style={styles.tip}>Tip: codes are usually 6 characters, like LKDCV9.</div>

      {errorMsg ? <div style={styles.error}>{errorMsg}</div> : null}
    </div>
  );
}

const styles = {
  card: {
    background: "white",
    border: "1px solid #e9e9e9",
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 900,
    color: "#111827",
  },
  subtitle: {
    margin: "8px 0 16px",
    color: "#6b7280",
    fontWeight: 600,
  },
  form: {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  alignItems: "stretch",
},

input: {
  width: "100%",
  boxSizing: "border-box",
  padding: "16px 16px",
  borderRadius: 14,
  border: "1px solid #ddd",
  fontSize: 17,
  fontWeight: 700,
  color: "#111827",
  background: "#ffffff",
  caretColor: "#111827",
  WebkitTextFillColor: "#111827",
  outline: "none",
},

primaryBtn: {
  width: "100%",
  boxSizing: "border-box",
  padding: "16px 16px",
  borderRadius: 14,
  border: "1px solid #111827",
  background: "#111827",
  color: "white",
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 17,
},
  tip: {
    marginTop: 10,
    opacity: 0.75,
    fontSize: 14,
  },
  error: {
    marginTop: 12,
    background: "#fff5f5",
    border: "1px solid #ffb3b3",
    color: "#b00020",
    borderRadius: 12,
    padding: 10,
  },
};