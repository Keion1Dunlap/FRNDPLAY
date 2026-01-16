// client/src/components/JoinRoom.jsx
import { useState } from "react";
import { supabase } from "../supabaseClient";

export default function JoinRoom({ user, setRoom }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const join = async () => {
    setErr("");
    setLoading(true);

    try {
      if (!user) throw new Error("You must be signed in to join a room.");

      const trimmed = code.trim().toUpperCase();
      if (!trimmed) throw new Error("Enter a room code");

      // 1) Find room by code
      const { data: room, error: roomErr } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", trimmed)
        .single();

      if (roomErr) throw roomErr;
      if (!room?.id) throw new Error("Room not found.");

      // 2) Upsert membership (role defaults to 'member' in DB)
      const { error: memberErr } = await supabase
        .from("room_members")
        .upsert([{ room_id: room.id, user_id: user.id }], {
          onConflict: "room_id,user_id",
        });

      if (memberErr) throw memberErr;

      // 3) Enter room
      setRoom(room);
    } catch (e) {
      setErr(e?.message || "Join failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <input
        className="input"
        placeholder="Enter room code (ex: A1B2C3)"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />

      <button className="btn" onClick={join} disabled={loading || !user}>
        {loading ? "Joining..." : "Join Room"}
      </button>

      <div className="muted" style={{ marginTop: 8 }}>
        Tip: codes are usually 6 characters (ex: LKDCV9)
      </div>

      {err ? (
        <div className="error" style={{ marginTop: 10 }}>
          {err}
        </div>
      ) : null}
    </>
  );
}
