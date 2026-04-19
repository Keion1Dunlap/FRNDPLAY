import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";

function formatSender(email) {
  const em = String(email || "").trim().toLowerCase();
  if (!em) return "guest";
  return em.includes("@") ? em.split("@")[0] : em;
}

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function RoomChat({ roomId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const countLabel = useMemo(() => messages.length, [messages]);

  useEffect(() => {
    let alive = true;

    async function initAuth() {
      const { data, error } = await supabase.auth.getSession();
      if (!alive) return;

      if (error) {
        console.error("Chat auth load error:", error);
        return;
      }

      setSession(data?.session ?? null);
    }

    initAuth();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, next) => {
      setSession(next ?? null);
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!roomId) {
      setMessages([]);
      return;
    }

    let alive = true;

    async function loadMessages() {
      setLoading(true);

      try {
        const { data, error } = await supabase
          .from("room_messages")
          .select("*")
          .eq("room_id", String(roomId))
          .order("created_at", { ascending: true })
          .limit(200);

        if (!alive) return;
        if (error) throw error;

        setMessages(data || []);
      } catch (err) {
        console.error("Chat load error:", err);
        if (alive) {
          setErrorMsg(err.message || "Failed to load chat.");
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    setErrorMsg("");
    loadMessages();

    const channel = supabase
      .channel(`room-chat:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const next = payload?.new;
          if (!next) return;

          setMessages((prev) => {
            if (prev.some((m) => m.id === next.id)) return prev;
            return [...prev, next];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "room_messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const oldRow = payload?.old;
          if (!oldRow?.id) return;

          setMessages((prev) => prev.filter((m) => m.id !== oldRow.id));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "room_messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const next = payload?.new;
          if (!next?.id) return;

          setMessages((prev) =>
            prev.map((m) => (m.id === next.id ? next : m))
          );
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("Chat realtime subscribed");
        }
      });

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const handleSend = async () => {
    if (!roomId || sending) return;

    const body = String(input || "").trim();
    if (!body) return;

    setSending(true);
    setErrorMsg("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("You must be signed in to chat.");

      const payload = {
        room_id: String(roomId),
        user_id: user.id,
        user_email: user.email || null,
        body,
      };

      const { error } = await supabase.from("room_messages").insert(payload);
      if (error) throw error;

      setInput("");
    } catch (err) {
      console.error("Chat send error:", err);
      setErrorMsg(err.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 18,
        border: "1px solid #e5e7eb",
        borderRadius: 18,
        padding: 18,
        background: "#fff",
        boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: 14 }}>Chat ({countLabel})</h3>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 12,
          background: "#fafafa",
          minHeight: 220,
          maxHeight: 320,
          overflowY: "auto",
          display: "grid",
          gap: 10,
        }}
      >
        {loading ? (
          <div style={{ color: "#6b7280" }}>Loading chat...</div>
        ) : messages.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No messages yet.</div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: 6,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 13 }}>
                  {formatSender(msg.user_email)}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {formatTime(msg.created_at)}
                </div>
              </div>

              <div
                style={{
                  fontSize: 14,
                  lineHeight: 1.45,
                  color: "#111827",
                  wordBreak: "break-word",
                }}
              >
                {msg.body}
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Send a message"
          disabled={sending}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #d1d5db",
            outline: "none",
            fontSize: 15,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
        />

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={handleSend}
            disabled={!roomId || sending || !String(input || "").trim()}
            style={{
              padding: "10px 16px",
              borderRadius: 12,
              border: "1px solid #111",
              background:
                !roomId || sending || !String(input || "").trim()
                  ? "#f3f4f6"
                  : "#111",
              color:
                !roomId || sending || !String(input || "").trim()
                  ? "#666"
                  : "#fff",
              cursor:
                !roomId || sending || !String(input || "").trim()
                  ? "not-allowed"
                  : "pointer",
              fontWeight: 700,
            }}
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>

        {errorMsg ? (
          <div style={{ color: "#b91c1c", fontSize: 14 }}>{errorMsg}</div>
        ) : null}
      </div>
    </div>
  );
}