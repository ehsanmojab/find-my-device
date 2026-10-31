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

  // Allow empty or missing phone_name, defaulting to "Android Device"
  const phoneName = typeof obj.phone_name === "string" && obj.phone_name.trim().length > 0
    ? obj.phone_name.trim().slice(0, 50)
    : "Android Device";

  // Support numeric or string coordinates, handling European decimal commas (e.g. "35,689")
  const rawLat = String(obj.lat ?? "").trim().replace(",", ".");
  const rawLon = String(obj.lon ?? "").trim().replace(",", ".");
  const lat = parseFloat(rawLat);
  const lon = parseFloat(rawLon);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    console.warn("Invalid lat received:", obj.lat);
    return null;
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    console.warn("Invalid lon received:", obj.lon);
    return null;
  }

  // Support missing, empty, or custom timestamps - default to current time if absent or invalid
  let timestamp = new Date().toISOString();
  if (typeof obj.timestamp === "string" && obj.timestamp.trim().length > 0) {
    const parsedTs = new Date(obj.timestamp.trim());
    if (!isNaN(parsedTs.getTime())) {
      timestamp = parsedTs.toISOString();
    }
  }

  return {
    phone_name: phoneName,
    lat,
    lon,
    timestamp,
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

  // ---- Auth: extract token ---------------------------------
  const authHeader = (req.headers.get("authorization") ?? "").trim().replace(/^['"]+|['"]+$/g, "");
  const tokenHeader = (req.headers.get("x-device-token") ?? "").trim().replace(/^['"]+|['"]+$/g, "");

  let tokenHex = "";
  const match = authHeader.match(/^Bearer\s+([0-9a-fA-F]{64})$/i);
  if (match) {
    tokenHex = match[1].toLowerCase();
  } else if (/^[0-9a-fA-F]{64}$/.test(authHeader)) {
    tokenHex = authHeader.toLowerCase();
  } else if (/^[0-9a-fA-F]{64}$/.test(tokenHeader)) {
    tokenHex = tokenHeader.toLowerCase();
  }

  if (!tokenHex) {
    console.warn("Unauthorized: invalid or missing token. Header:", authHeader);
    return jsonResponse({
      error: "Unauthorized: Invalid or missing 64-char token. Expected 'Authorization: Bearer <token>'",
    }, 401);
  }

  // ---- Body size guard -------------------------------------
  const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: "Payload too large" }, 413);
  }

  // ---- Parse body ------------------------------------------
  let body: unknown;
  const rawText = await req.text();
  if (rawText.length > MAX_BODY_BYTES) {
    return jsonResponse({ error: "Payload too large" }, 413);
  }

  try {
    body = JSON.parse(rawText);
  } catch (_jsonErr) {
    // Fallback: try parsing form url-encoded data (e.g. lat=35.1&lon=51.2)
    try {
      const params = new URLSearchParams(rawText);
      if (params.has("lat") && params.has("lon")) {
        body = {
          lat: params.get("lat"),
          lon: params.get("lon"),
          phone_name: params.get("phone_name") || "Android Device",
          timestamp: params.get("timestamp") || new Date().toISOString(),
        };
      } else {
        console.warn("Invalid body received (not valid JSON):", rawText.slice(0, 200));
        return jsonResponse({
          error: "Invalid JSON in request body",
          received: rawText.slice(0, 200),
        }, 400);
      }
    } catch {
      console.warn("Invalid body received:", rawText.slice(0, 200));
      return jsonResponse({
        error: "Invalid JSON in request body",
        received: rawText.slice(0, 200),
      }, 400);
    }
  }

  // Normalise single object → array
  const rawPoints = Array.isArray(body) ? body : [body];
  if (rawPoints.length === 0 || rawPoints.length > MAX_POINTS) {
    return jsonResponse({ error: "Invalid point count: must be between 1 and 500" }, 400);
  }

  // Validate each point
  const points: LocationPoint[] = [];
  for (const rp of rawPoints) {
    const vp = validatePoint(rp);
    if (!vp) {
      console.warn("Invalid point data received:", rp);
      return jsonResponse({
        error: "Invalid point data: 'lat' and 'lon' must be valid numbers between -90..90 and -180..180.",
        received_point: rp,
      }, 400);
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
    console.warn("Unauthorized: token hash not found in device_secrets:", tokenHash);
    return jsonResponse({ error: "Unauthorized: Token not recognized" }, 401);
  }

  // Constant-time verify after DB lookup (defense in depth)
  if (!constantTimeHexEqual(matchRow.token_hash, tokenHash)) {
    return jsonResponse({ error: "Unauthorized: Token mismatch" }, 401);
  }

  const deviceId = matchRow.device_id;

  // ---- Check revoked status --------------------------------
  const { data: device, error: deviceErr } = await supabase
    .from("devices")
    .select("revoked")
    .eq("id", deviceId)
    .single();

  if (deviceErr || !device || device.revoked) {
    console.warn("Unauthorized: device is revoked or missing:", deviceId);
    return jsonResponse({ error: "Unauthorized: Device is revoked" }, 401);
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
