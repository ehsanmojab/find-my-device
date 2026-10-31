# Find Any Device

A secure, self-hosted "Find My Device" platform. Track your Android devices on a map using MacroDroid + Supabase.

**Stack**: Vue 3 · Vite · Tailwind CSS · Supabase (Postgres, Auth, RLS, Edge Functions) · Leaflet + OpenStreetMap

## Features

- 🗺️ Live dashboard map showing the latest location of each device
- 📍 Full location history with path visualization and date/time filtering
- 🔐 Secure token-based device authentication (SHA-256 hashed, shown once)
- 👥 Multi-user with Row Level Security — each user sees only their own data
- 📱 Android sender via MacroDroid with offline retry
- 🚫 No rate limits — accepts old, backfilled, and batched location points
- 🔑 Optional TOTP MFA

## Architecture

```
Android (MacroDroid)
  ↓ HTTPS POST with Bearer token
Supabase Edge Function (ingest)
  ↓ service role INSERT
Supabase Postgres (RLS)
  ↑ anon key SELECT (own data only)
Vue 3 SPA (GitHub Pages)
```

---

## Setup

### 1. Supabase Project

1. Create a free project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor** and run the migration file:
   - `supabase/migrations/00001_initial_schema.sql`
3. **Auth settings** (Authentication → Settings):
   - Disable "Enable email confirmations" (since emails are synthetic `username@domain`).
   - Set minimum password length to **12**.
   - Optionally enable TOTP MFA under "Multi Factor Authentication".
   - Under "Email domains", ensure your configured domain (e.g., `findanydevice.local`) is allowed or that email confirmation is disabled.
4. **Create users** manually (Authentication → Users → Add User):
   - Email: `username@findanydevice.local` (replace `username` with desired username)
   - Password: at least 12 characters
   - After creating, insert a matching profile row:
     ```sql
     INSERT INTO public.profiles (id, username) VALUES ('<user-uuid>', 'username');
     ```

### 2. Deploy the Edge Function

1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli).
2. Link your project:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```
3. Deploy the Edge Function:
   ```bash
   supabase functions deploy ingest --no-verify-jwt
   ```
   The `--no-verify-jwt` flag is critical — the function uses device tokens, not Supabase JWTs.

4. The service role key is automatically available as `SUPABASE_SERVICE_ROLE_KEY` in Edge Functions.

### 3. GitHub Repository Setup

1. Push this repo to GitHub.
2. Go to **Settings → Pages** → Source: **GitHub Actions**.
3. Go to **Settings → Variables and secrets → Variables** (not Secrets!) and add:

   | Variable                | Value                                  |
   |------------------------|----------------------------------------|
   | `VITE_SUPABASE_URL`    | `https://YOUR_PROJECT.supabase.co`     |
   | `VITE_SUPABASE_ANON_KEY` | `your-anon-key`                      |
   | `VITE_EMAIL_DOMAIN`    | `findanydevice.local`                  |
   | `VITE_BASE_PATH`       | `/your-repo-name/`                     |

   > The anon key is **public** by design. It is safe as a variable (not a secret).

4. Push to `main` to trigger the deploy workflow.

### 4. Local Development

```bash
cd frontend
cp .env.example .env.local
# Edit .env.local with your Supabase URL and anon key
npm install
npm run dev
```

### 5. Android Setup (MacroDroid)

See the **Add Device** page in the web UI for step-by-step MacroDroid setup with pre-filled token and JavaScript code.

#### Quick Summary

1. **Add Device** in the web UI → copy the token.
2. In MacroDroid, create a macro:
   - **Trigger**: Timer → Interval (e.g., every 5 min)
   - **Action 1**: Location → Force Location Update
   - **Action 2**: JavaScript action (paste the code from the Add Device page, output to variable `payload`)
   - **Action 3**: HTTP Request (POST to `https://YOUR_PROJECT.supabase.co/functions/v1/ingest`, Authorization header with Bearer token, body `{payload}`)
   - **Action 4**: If `http_status ≠ 200`, save payload to `retry_payload` for next run.
3. Grant MacroDroid location (always) permission and exempt from battery optimization.

#### MacroDroid Assumptions

- `lm("latitude")` and `lm("longitude")` are MacroDroid magic text functions that return the device's current location coordinates. These require the Location trigger or Force Location Update action to have run first.
- `getVar("varname")` reads a MacroDroid user variable by name.
- `mdOutput(value)` sets the JavaScript action's output, captured into the configured output variable.
- The **HTTP Request** action supports custom headers and body from variables.
- If `lm()` magic text is not accessible from JavaScript, use the **Share Location to Variable** action before JavaScript, storing lat/lon into MacroDroid user variables `loc_lat` and `loc_lon`, then access them with `getVar()`.

#### Variant B: Pure JavaScript with fetch (Test First)

Run this one-line test in a MacroDroid JavaScript action to check if `fetch` is available:

```javascript
mdOutput(typeof fetch !== "undefined" ? "fetch_available" : "fetch_not_available");
```

If the output variable contains `fetch_available`, you can use this variant:

```javascript
var lat = getVar("loc_lat") || lm("latitude");
var lon = getVar("loc_lon") || lm("longitude");
var phoneName = "YOUR_PHONE_NAME";
var token = "YOUR_DEVICE_TOKEN";
var url = "https://YOUR_PROJECT.supabase.co/functions/v1/ingest";

var point = { phone_name: phoneName, lat: parseFloat(lat), lon: parseFloat(lon), timestamp: new Date().toISOString() };
var retry = getVar("retry_payload");
var payload;
if (retry && retry.length > 2) {
  try { var prev = JSON.parse(retry); payload = Array.isArray(prev) ? prev.concat([point]) : [prev, point]; } catch(e) { payload = point; }
} else { payload = point; }

try {
  var resp = fetch(url, {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  // Note: fetch in MacroDroid's JS engine may be synchronous.
  // If it returns a Promise, this variant won't work — use Variant A.
  mdOutput("200");
} catch(e) {
  mdOutput("error");
}
```

> ⚠️ **Do not assume Variant B works.** MacroDroid's JavaScript engine is a limited embedded runtime. Variant A (using the HTTP Request action) is the reliable default.

---

## Project Structure

```
find-any-device/
├── .github/
│   ├── workflows/deploy.yml     # CI: audit + build + deploy
│   └── dependabot.yml           # Automated dependency updates
├── frontend/
│   ├── index.html               # Entry point with CSP meta tag
│   ├── vite.config.js
│   ├── .env.example
│   ├── package.json
│   └── src/
│       ├── main.js
│       ├── style.css             # Global styles + Tailwind
│       ├── App.vue
│       ├── lib/
│       │   └── supabase.js       # Supabase client (public keys only)
│       ├── router/
│       │   └── index.js          # Hash-mode router with auth guard
│       └── views/
│           ├── LoginView.vue     # Username + password + MFA
│           ├── DashboardView.vue # Map + device list
│           ├── DeviceView.vue    # History path + filters + revoke/delete
│           └── AddDeviceView.vue # Create device + token + MacroDroid setup
├── supabase/
│   ├── migrations/
│   │   └── 00001_initial_schema.sql
│   └── functions/
│       └── ingest/
│           └── index.ts          # Edge Function (device token auth)
├── SECURITY.md                   # Threat model + test checklist
├── LICENSE                       # MIT
└── README.md
```

## License

MIT
