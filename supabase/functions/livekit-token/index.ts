// LiveKit access token endpoint.
//
// Request:  POST  Authorization: Bearer <supabase user access token>
//           body: { "roomName": string }
// Response: 200 { "token": "<livekit jwt>" }
//
// The LiveKit API secret never leaves the server.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  // Server-side configuration. SUPABASE_URL / SUPABASE_ANON_KEY are injected
  // automatically by the Supabase runtime; LIVEKIT_* must be set as secrets.
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY");
  const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET");

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
    return json({ error: "Server misconfigured" }, 500);
  }

  if (!livekitApiKey || !livekitApiSecret) {
    console.error("Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET");
    return json({ error: "Server misconfigured" }, 500);
  }

  // Verify the caller's Supabase access token.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing Authorization header" }, 401);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Parse and validate the request body.
  let payload: { roomName?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const roomName =
    typeof payload?.roomName === "string" ? payload.roomName.trim() : "";

  if (!roomName) {
    return json({ error: "roomName is required" }, 400);
  }

  try {
    const accessToken = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: user.id,
      name: user.email ?? user.id,
      ttl: 3600,
    });

    // Scope the token to the requested room only.
    accessToken.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await accessToken.toJwt();

    return json({ token });
  } catch (err) {
    console.error("Failed to generate LiveKit token", err);
    return json({ error: "Failed to generate token" }, 500);
  }
});
