# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| main    | ✅        |

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not open a public issue**.

Email: **[your-email@example.com]** with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

You will receive a response within 48 hours.

---

## Threat Model

### 1. Stolen or Leaked Device Token (No Rate Limit)

**Threat**: An attacker who obtains a plaintext device token can submit arbitrary location data for that device. Since there is no rate limit by design, they can flood the device's history.

**Mitigations**:
- Tokens are 256-bit random hex strings — not guessable by brute force (2^256 entropy).
- Tokens are shown exactly once during device creation and never stored in plaintext server-side (only SHA-256 hashes are stored).
- **Revoke procedure**: The device owner can immediately revoke the token from the web UI (Dashboard → Device → Revoke). The Edge Function checks `revoked` status on every request and rejects revoked tokens. Revocation is instant.
- After revoking, the user can delete the device (and all its history) and create a new one if needed.
- The token is transmitted only over HTTPS (Supabase enforces TLS).

**Residual risk**: If the token is stolen before the owner notices, the attacker can inject fake locations into that device's history. This is an accepted risk given the no-rate-limit requirement.

### 2. Leaked Anon Key

**Threat**: The Supabase anon key is public by design (embedded in the frontend). An attacker with the anon key can:
- Attempt to sign in (requires valid username + strong password ≥12 chars).
- Call any client-facing RPC or query.

**Mitigations**:
- RLS is enabled on **all tables**. Users can only SELECT their own data.
- `device_secrets` has RLS ON with zero policies — no client can ever read token hashes.
- `locations` has no client INSERT policy — only the Edge Function (using the service role key) can insert.
- `create_device` RPC requires authentication (`auth.uid()` check).
- Minimum 12-character password policy in Supabase Auth.
- Optional TOTP MFA adds a second factor.

**Residual risk**: None beyond normal Supabase public anon key exposure.

### 3. Brute Force Login

**Threat**: An attacker repeatedly tries username/password combinations.

**Mitigations**:
- Supabase Auth has built-in rate limiting on `signInWithPassword` (throttles after repeated failures).
- Strong password policy (minimum 12 characters) makes dictionary attacks impractical.
- Optional TOTP MFA requires a second factor even if the password is compromised.
- Public signup is disabled — attackers cannot enumerate users by creating accounts.
- Username→email mapping uses a private domain, so the email format is not guessable from public info.

### 4. Fake Locations

**Threat**: A compromised device token allows submitting arbitrary lat/lon values.

**Mitigations**:
- The Edge Function validates lat ∈ [-90, 90] and lon ∈ [-180, 180].
- Beyond this, there is no server-side way to verify location authenticity (this is a fundamental limitation of any location tracking system).
- Revoke the token immediately upon suspicion.

### 5. XSS (Cross-Site Scripting)

**Threat**: An attacker injects malicious scripts via device names, usernames, or other user-controlled data.

**Mitigations**:
- Vue 3 auto-escapes all template interpolation (`{{ }}`) by default.
- `v-html` is **never used** anywhere in the codebase.
- A strict Content Security Policy (CSP) meta tag is set in `index.html`:
  - `script-src 'self'` — no inline scripts, no `eval()`.
  - `object-src 'none'` — no plugins.
  - `frame-src 'none'` — no iframes.
  - `base-uri 'self'` — prevents base tag injection.
- Leaflet popup content uses `escapeHtml()` for all user data.

### 6. Database Flooding

**Threat**: An attacker with a valid token submits massive amounts of location data to fill the database.

**Mitigations**:
- Edge Function caps at 500 points per request and 1 MB body size.
- Unique constraint `(device_id, recorded_at, lat, lon)` prevents duplicate entries.
- The device owner can revoke the token immediately to stop further writes.
- After revoking, deleting the device cascades to delete all its locations.
- Supabase free tier has a 500 MB database limit, which acts as a natural ceiling.

**Residual risk**: A determined attacker with a valid token can fill a significant portion of the database before being noticed. Monitor database size in the Supabase dashboard.

### 7. Service Role Key Exposure

**Threat**: The service role key bypasses RLS. If leaked, full database access is compromised.

**Mitigations**:
- The service role key is **only** stored as a Supabase Edge Function secret — never in the frontend, Git, or CI variables.
- It is never exposed in API responses.
- Edge Function environment is isolated and managed by Supabase.

---

## Test Checklist

### User Isolation
- [ ] User A logs in and sees only their own devices
- [ ] User A cannot query User B's devices via Supabase client (`select * from devices` returns only own)
- [ ] User A cannot query User B's locations (`select * from locations` returns only own devices' locations)
- [ ] User A cannot read `device_secrets` at all (query returns empty / permission denied)
- [ ] User A cannot INSERT into `locations` (RLS blocks it)

### Token Auth (Edge Function)
- [ ] Request with no `Authorization` header → 401
- [ ] Request with `Authorization: Bearer invalidtoken` → 401
- [ ] Request with a revoked device's token → 401
- [ ] Request with a valid token → 200

### Data Acceptance
- [ ] Single point with current timestamp → 200, stored
- [ ] Array of 10 points → 200, all stored
- [ ] Point with an old timestamp (e.g., 1 year ago) → 200, stored
- [ ] Duplicate point (same device, timestamp, lat, lon) → 200, no duplicate created
- [ ] 500 points in one request → 200
- [ ] 501 points → 400 (exceeds max)

### Validation
- [ ] lat = 91 → 400
- [ ] lon = -181 → 400
- [ ] Invalid timestamp → 400
- [ ] phone_name > 50 chars → 400
- [ ] Empty body → 400

### Frontend Security
- [ ] CSP meta tag is present in built HTML
- [ ] No `v-html` in any .vue file
- [ ] Device name with `<script>alert(1)</script>` renders as text, not executed
