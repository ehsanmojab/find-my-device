// supabase/functions/ingest/index.ts
// Edge Function: ingest device location data
// Deployed WITHOUT JWT verification – device token is the auth mechanism.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.224.0/encoding/hex.ts";
import {
  timingSafeEqual,
} from "https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

const MAX_POINTS = 500;
const MAX_BODY_BYTES = 1_048_576; // 1 MB

// ---- helpers ------------------------------------------------

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function sha256hex(hexToken: string): Promise<string> {
  const bytes = new Uint8Array(
    hexToken.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)),
  );
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return encodeHex(new Uint8Array(hash));
}

function constantTimeHexEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

interface LocationPoint {
  phone_name: string;
  lat: number;
  lon: number;
  timestamp: string;
}

function validatePoint(p: unknown): LocationPoint | null {
  if (typeof p !== "object" || p === null) return null;
  const obj = p as Record<string, unknown>;

  if (typeof obj.phone_name !== "string") return null;
  if (obj.phone_name.length === 0 || obj.phone_name.length > 50) return null;

  const lat = Number(obj.lat);
  const lon = Number(obj.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return null;

  if (typeof obj.timestamp !== "string") return null;
  const ts = new Date(obj.timestamp);
  if (isNaN(ts.getTime())) return null;

  return {
    phone_name: obj.phone_name,
    lat,
    lon,
    timestamp: ts.toISOString(),
  };
}

// ---- handler ------------------------------------------------

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ---- Auth: extract bearer token --------------------------
  const authHeader = req.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+([0-9a-fA-F]{64})$/);
  if (!match) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const tokenHex = match[1].toLowerCase();

  // ---- Body size guard -------------------------------------
  const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: "Payload too large" }, 413);
  }

  // ---- Parse body ------------------------------------------
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return jsonResponse({ error: "Payload too large" }, 413);
    }
    body = JSON.parse(text);
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  // Normalise single object → array
  const rawPoints = Array.isArray(body) ? body : [body];
  if (rawPoints.length === 0 || rawPoints.length > MAX_POINTS) {
    return jsonResponse({ error: "Invalid point count" }, 400);
  }

  // Validate each point
  const points: LocationPoint[] = [];
  for (const rp of rawPoints) {
    const vp = validatePoint(rp);
    if (!vp) {
      return jsonResponse({ error: "Invalid point data" }, 400);
    }
    points.push(vp);
  }

  // ---- Token lookup ----------------------------------------
  const tokenHash = await sha256hex(tokenHex);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Look up by hash. The DB uses a simple equality index scan.
  // We then do a constant-time comparison as defense in depth,
  // even though timing on the hash itself is not exploitable
  // (attacker doesn't know the hash, only the raw token).
  const { data: matchRow, error: matchErr } = await supabase
    .from("device_secrets")
    .select("device_id, token_hash")
    .eq("token_hash", tokenHash)
    .limit(1)
    .single();

  if (matchErr || !matchRow) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // Constant-time verify after DB lookup (defense in depth)
  if (!constantTimeHexEqual(matchRow.token_hash, tokenHash)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const deviceId = matchRow.device_id;

  // ---- Check revoked status --------------------------------
  const { data: device, error: deviceErr } = await supabase
    .from("devices")
    .select("revoked")
    .eq("id", deviceId)
    .single();

  if (deviceErr || !device || device.revoked) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // ---- Insert locations (ON CONFLICT DO NOTHING) -----------
  const rows = points.map((p) => ({
    device_id: deviceId,
    lat: p.lat,
    lon: p.lon,
    recorded_at: p.timestamp,
    received_at: new Date().toISOString(),
  }));

  const { error: insertErr } = await supabase
    .from("locations")
    .upsert(rows, {
      onConflict: "device_id,recorded_at,lat,lon",
      ignoreDuplicates: true,
    });

  if (insertErr) {
    console.error("Insert error:", insertErr);
    return jsonResponse({ error: "Server error" }, 500);
  }

  // ---- Update device metadata ------------------------------
  // Use the latest phone_name from the batch and set last_seen
  const latestPoint = points.reduce((a, b) =>
    new Date(a.timestamp) > new Date(b.timestamp) ? a : b
  );

  const { error: updateErr } = await supabase
    .from("devices")
    .update({
      phone_name: latestPoint.phone_name,
      last_seen: new Date().toISOString(),
    })
    .eq("id", deviceId);

  if (updateErr) {
    console.error("Update error:", updateErr);
    // Non-fatal: locations were already inserted
  }

  return jsonResponse({ ok: true, inserted: rows.length }, 200);
});
