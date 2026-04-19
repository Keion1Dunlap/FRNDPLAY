// supabase/functions/verify-checkout-session/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function addHoursIso(baseIso: string, hours: number) {
  const base = new Date(baseIso).getTime();
  return new Date(base + hours * 60 * 60 * 1000).toISOString();
}

function maxIso(a?: string | null, b?: string | null) {
  const ta = a ? new Date(a).getTime() : -Infinity;
  const tb = b ? new Date(b).getTime() : -Infinity;
  return ta >= tb ? a : b;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!STRIPE_SECRET_KEY) throw new Error("Missing STRIPE_SECRET_KEY env var");
    if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL env var");
    if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var");

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const session_id = body.session_id ?? body.sessionId ?? null;
    const room_id = body.room_id ?? null;

    if (!session_id) throw new Error("Missing session_id in request body");

    // 1) Fetch Stripe session
    const session = await stripe.checkout.sessions.retrieve(String(session_id), {
      expand: ["payment_intent"],
    });

    // Must be a completed/paid session
    const paid =
      session.payment_status === "paid" || (session.status && session.status === "complete");

    if (!paid) {
      return new Response(JSON.stringify({ ok: false, reason: "not_paid_yet" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 2) Determine room_id from metadata (source of truth), fallback to request body
    const metaRoomId = session.metadata?.room_id || null;
    const resolvedRoomId = metaRoomId || room_id;
    if (!resolvedRoomId) throw new Error("No room_id found (session metadata + request body empty)");

    // 3) Load room
    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", resolvedRoomId)
      .single();

    if (roomErr) throw roomErr;

    // 4) Extend paid_until (and expires_at) by 24 hours from the later of (now, current value)
    const nowIso = new Date().toISOString();

    const basePaid = maxIso(room.paid_until, nowIso) || nowIso;
    const newPaidUntil = addHoursIso(basePaid, 24);

    // If you want the room itself to last 24h after payment too, extend expires_at similarly.
    // If you DON'T want expires tied to payment, you can remove this block.
    const baseExp = maxIso(room.expires_at, nowIso) || nowIso;
    const newExpiresAt = addHoursIso(baseExp, 24);

    // 5) Update room + log payment (optional)
    const { data: updatedRoom, error: updErr } = await supabase
      .from("rooms")
      .update({
        paid_until: newPaidUntil,
        expires_at: newExpiresAt,
      })
      .eq("id", room.id)
      .select("*")
      .single();

    if (updErr) throw updErr;

    // Optional: store a payment record if you have room_payments table
    // (your table list shows room_payments exists)
    try {
      await supabase.from("room_payments").insert([
        {
          room_id: room.id,
          stripe_session_id: session.id,
          amount_cents: session.amount_total ?? 500,
          currency: session.currency ?? "usd",
          status: session.payment_status ?? session.status ?? "unknown",
        },
      ]);
    } catch {
      // ignore if schema doesn't match; not required for paid_until to work
    }

    return new Response(
      JSON.stringify({
        ok: true,
        room_id: room.id,
        paid_until: updatedRoom.paid_until,
        expires_at: updatedRoom.expires_at,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (e) {
    console.error("verify-checkout-session error:", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
