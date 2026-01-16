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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!STRIPE_SECRET_KEY) throw new Error("Missing STRIPE_SECRET_KEY");
    if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
    if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SERVICE_ROLE_KEY");

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const session_id = body.session_id;
    const room_id = body.room_id;

    if (!session_id) throw new Error("Missing session_id");

    // 1️⃣ Retrieve Stripe session
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== "paid") {
      throw new Error("Payment not completed");
    }

    // 2️⃣ Resolve room ID (fallback to metadata)
    const finalRoomId =
      room_id ||
      session.metadata?.room_id;

    if (!finalRoomId) {
      throw new Error("Missing room_id");
    }

    // 3️⃣ Update room — THIS WAS MISSING BEFORE
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: updatedRoom, error } = await supabase
      .from("rooms")
      .update({
        paid: true,
        party_active: true,
        expires_at: expiresAt,
      })
      .eq("id", finalRoomId)
      .select()
      .single();

    if (error) throw error;

    // 4️⃣ Return updated room
    return new Response(
      JSON.stringify({
        success: true,
        room: updatedRoom,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (e) {
    console.error("verify-checkout-session error:", e);
    return new Response(
      JSON.stringify({ error: String(e?.message ?? e) }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
