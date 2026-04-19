// client/src/components/JoinRoom.jsx
import { useState } from "react";
import { supabase } from "../supabase";

export default function JoinRoom({ user, setRoom }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const joinRoom = async () => {
    setErrorMsg("");
    setLoading(true);

    try {
      if (!user?.id) {
  return setErrorMsg("Sign in to join this room.");
}
      const trimmed = String(code || "").trim().toUpperCase();
      if (!trimmed) throw new Error("Enter a room code.");

      // 1) Find the room by code
      const { data: room, error: roomErr } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", trimmed)
        .single();

      if (roomErr) throw roomErr;
      if (!room?.id) throw new Error("Room not found.");

      // 2) Join idempotently: UPSERT membership (prevents duplicate key errors)
      const { error: memberErr } = await supabase
        .from("room_members")
        .upsert(
          { room_id: room.id, user_id: user.id, role: "guest" },
          { onConflict: "room_id,user_id" }
        );

      // With upsert it *shouldn't* happen, but if it does, treat as "already joined".
      if (memberErr && memberErr.code !== "23505") throw memberErr;

      // ✅ 3) Set the URL automatically
      const url = new URL(window.location.href);
      url.searchParams.set("room", trimmed);
      url.searchParams.delete("session_id");
      url.searchParams.delete("checkout");
      window.history.replaceState({}, "", url.toString());

      // 4) Enter the room UI
      setRoom(room);
    } catch (e) {
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.card}>
      <h2 style={{ marginTop: 0 }}>Join a room</h2>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter room code"
          style={styles.input}
          disabled={loading}
        />
        <button onClick={joinRoom} disabled={loading} style={styles.primaryBtn}>
          {loading ? "Joining..." : "Join Room"}
        </button>
      </div>

      <div style={{ marginTop: 10, opacity: 0.75, fontSize: 14 }}>
        Tip: codes are usually 6 characters (ex: LKDCV9)
      </div>

      {errorMsg ? <div style={styles.error}>{errorMsg}</div> : null}
    </div>
  );
}

const styles = {
  card: {
    background: "white",
    border: "1px solid #e9e9e9",
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  },
  input: {
    flex: 1,
    minWidth: 240,
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    fontSize: 14,
  },
  primaryBtn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #111",
    background: "#111",
    color: "white",
    cursor: "pointer",
    fontWeight: 800,
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
