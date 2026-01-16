import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! // REQUIRED
  );

  // Find expired rooms
  const { data: expiredRooms, error } = await supabase
    .from("rooms")
    .select("id")
    .lt("party_expires_at", new Date().toISOString());

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  if (!expiredRooms || expiredRooms.length === 0) {
    return new Response(JSON.stringify({ message: "No expired rooms" }), {
      status: 200,
    });
  }

  const roomIds = expiredRooms.map((r) => r.id);

  // Delete queue items
  await supabase.from("queue_items").delete().in("room_id", roomIds);

  // Delete room members
  await supabase.from("room_members").delete().in("room_id", roomIds);

  // Delete rooms
  await supabase.from("rooms").delete().in("id", roomIds);

  return new Response(
    JSON.stringify({
      deleted_rooms: roomIds.length,
    }),
    { status: 200 }
  );
});
