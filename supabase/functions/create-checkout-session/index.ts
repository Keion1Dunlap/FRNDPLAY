// supabase/functions/create-checkout-session/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    const room_id = body.room_id ?? null;
    const room_code = body.room_code ?? body.code ?? null;
    const intent = body.intent ?? "pay"; // "pay" | "renew"
    const origin =
      req.headers.get("origin") ||
      body.origin ||
      "http://localhost:5173";

    // 1) Resolve the room
    let room: any = null;

    if (room_id) {
      const { data, error } = await supabase.from("rooms").select("*").eq("id", room_id).single();
      if (error) throw error;
      room = data;
    } else if (room_code) {
      const cleaned = String(room_code).trim().toUpperCase();
      const { data, error } = await supabase.from("rooms").select("*").eq("code", cleaned).single();
      if (error) throw error;
      room = data;
    } else {
      throw new Error("Missing room_id (or room_code) in request body");
    }

    if (!room?.code) throw new Error("Room missing code");

    // 2) Price (simple: $5 fixed)
    // If you later want Stripe Price IDs, swap this to price: "price_..."
    const unit_amount = 500; // $5.00 in cents

    // 3) Success/cancel URLs must be absolute
    // Put room code + session_id in URL so frontend can verify
    const success_url = `${origin}/?room=${encodeURIComponent(room.code)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url = `${origin}/?room=${encodeURIComponent(room.code)}&checkout=cancel`;

    // 4) Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: intent === "renew" ? "FRNDPLAY Room Renewal (24 hours)" : "FRNDPLAY Room Activation (24 hours)",
            },
            unit_amount,
          },
          quantity: 1,
        },
      ],
      success_url,
      cancel_url,
      metadata: {
        room_id: room.id,
        room_code: room.code,
        intent: String(intent),
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    console.error("create-checkout-session error:", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
