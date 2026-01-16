import "dotenv/config";

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { createClient } from "@supabase/supabase-js";
import { nanoid } from "nanoid";
import { z } from "zod";

console.log("index.js is running ✅");
console.log("ENV CHECK:", {
  PORT: process.env.PORT,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SERVICE_ROLE_SET: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  CORS_ORIGIN: process.env.CORS_ORIGIN
});

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

app.get("/health", (_, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: process.env.CORS_ORIGIN || "*" } });

// Use TWO Supabase clients:
// - supabaseAdmin: service role for DB writes/reads (server-only)
// - supabaseAuth: publishable/anon key for verifying user JWT access tokens
//   (the JWT is the proof — this client does NOT need service role)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const supabaseAuth = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false } }
);

const roomChannel = (roomId) => `room:${roomId}`;
const nowIso = () => new Date().toISOString();
const upper = (s) => String(s || "").trim().toUpperCase();

// Auth: iOS app sends Supabase JWT as socket.handshake.auth.accessToken
io.use(async (socket, next) => {
  try {
    // Token can come from different client libs:
    // - JS socket.io-client v4: socket.handshake.auth.accessToken
    // - Swift Socket.IO-Client: sent as query/connectParams => socket.handshake.query.accessToken
    // - Fallback: Authorization header "Bearer <token>"
    const fromAuth = socket.handshake.auth?.accessToken;
    const fromQuery = socket.handshake.query?.accessToken;
    const fromHeader = socket.handshake.headers?.authorization;

    const token =
      (typeof fromAuth === "string" ? fromAuth : null) ||
      (typeof fromQuery === "string" ? fromQuery : Array.isArray(fromQuery) ? fromQuery[0] : null) ||
      (typeof fromHeader === "string" && fromHeader.toLowerCase().startsWith("bearer ")
        ? fromHeader.slice(7)
        : null);

    if (!token) throw new Error("Missing access token");

    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error) throw error;

    socket.user = data.user;
    next();
  } catch (e) {
    next(new Error("Unauthorized"));
  }
});

async function getRole(roomId, userId) {
  const { data } = await supabaseAdmin
    .from("room_members")
    .select("role")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role ?? null;
}

io.on("connection", (socket) => {
  socket.on("ROOM_CREATE", async ({ name }, cb) => {
    try {
      const code = nanoid(6).toUpperCase();
      const ownerId = socket.user.id;

      const { data: room, error } = await supabaseAdmin
        .from("rooms")
        .insert([{ code, name: name ?? "Party", owner_id: ownerId, host_user_id: ownerId }])
        .select("*")
        .single();
      if (error) throw error;

      await supabaseAdmin.from("room_members").insert([
        { room_id: room.id, user_id: ownerId, role: "host", last_seen_at: nowIso() }
      ]);

      socket.join(roomChannel(room.id));
      cb?.({ ok: true, room });
    } catch (e) {
      cb?.({ ok: false, error: e.message });
    }
  });

  socket.on("ROOM_JOIN", async ({ code }, cb) => {
    try {
      z.object({ code: z.string().min(4) }).parse({ code });
      const clean = upper(code);

      const { data: room, error } = await supabaseAdmin
        .from("rooms")
        .select("*")
        .eq("code", clean)
        .is("ended_at", null)
        .single();
      if (error) throw error;

      await supabaseAdmin.from("room_members").upsert([
        { room_id: room.id, user_id: socket.user.id, role: "guest", last_seen_at: nowIso() }
      ]);

      socket.join(roomChannel(room.id));

      const { data: queue } = await supabaseAdmin
        .from("queue_items")
        .select("*")
        .eq("room_id", room.id)
        .neq("status", "removed")
        .order("position", { ascending: true });

      const { data: playback } = await supabaseAdmin
        .from("room_playback_state")
        .select("*")
        .eq("room_id", room.id)
        .maybeSingle();

      cb?.({ ok: true, room, queue: queue ?? [], playback: playback ?? null });
    } catch (e) {
      cb?.({ ok: false, error: e.message });
    }
  });

  socket.on("QUEUE_ADD", async (payload, cb) => {
    try {
      const schema = z.object({
        roomId: z.string().uuid(),
        provider: z.enum(["spotify"]),
        track: z.object({
          trackId: z.string().min(1), // spotify:track:...
          title: z.string().min(1),
          artist: z.string().optional(),
          artworkUrl: z.string().optional(),
          durationMs: z.number().int().optional()
        })
      });

      const { roomId, provider, track } = schema.parse(payload);

      const { data: last } = await supabaseAdmin
        .from("queue_items")
        .select("position")
        .eq("room_id", roomId)
        .neq("status", "removed")
        .order("position", { ascending: false })
        .limit(1);

      const nextPos = (last?.[0]?.position ?? 0) + 1;

      const { data: item, error } = await supabaseAdmin
        .from("queue_items")
        .insert([{
          room_id: roomId,
          added_by: socket.user.id,
          provider,
          track_id: track.trackId,
          title: track.title,
          artist: track.artist ?? null,
          artwork_url: track.artworkUrl ?? null,
          duration_ms: track.durationMs ?? null,
          position: nextPos,
          status: "queued",
          created_at: nowIso()
        }])
        .select("*")
        .single();
      if (error) throw error;

      io.to(roomChannel(roomId)).emit("QUEUE_UPDATED", { type: "added", item });
      cb?.({ ok: true, item });
    } catch (e) {
      cb?.({ ok: false, error: e.message });
    }
  });

  socket.on("PLAYBACK_SET", async ({ roomId, trackId, isPlaying }, cb) => {
    try {
      z.object({
        roomId: z.string().uuid(),
        trackId: z.string().nullable().optional(),
        isPlaying: z.boolean()
      }).parse({ roomId, trackId, isPlaying });

      const role = await getRole(roomId, socket.user.id);
      if (role !== "host") throw new Error("Host only");

      const state = {
        room_id: roomId,
        provider: trackId ? "spotify" : null,
        track_id: trackId ?? null,
        started_at: trackId ? nowIso() : null,
        is_playing: !!isPlaying,
        updated_at: nowIso()
      };

      await supabaseAdmin.from("room_playback_state").upsert([state]);
      io.to(roomChannel(roomId)).emit("PLAYBACK_UPDATED", state);

      cb?.({ ok: true });
    } catch (e) {
      cb?.({ ok: false, error: e.message });
    }
  });
});

httpServer.listen(process.env.PORT || 4000, () => {
  console.log(`Server listening on ${process.env.PORT || 4000}`);
});
