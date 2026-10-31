-- =============================================================
-- Find Any Device – Initial Schema Migration
-- =============================================================

-- 0. EXTENSIONS ----------------------------------------------
create extension if not exists pgcrypto with schema extensions;

-- 1. PROFILES ------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text not null unique
               check (username ~ '^[a-z0-9_]{3,20}$')
);

alter table public.profiles enable row level security;

create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- No INSERT/UPDATE/DELETE policies – profiles are created by
-- an admin via SQL or a service-role call.

-- 2. DEVICES -------------------------------------------------
create table public.devices (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  phone_name  text not null check (char_length(phone_name) between 1 and 50),
  created_at  timestamptz not null default now(),
  last_seen   timestamptz,
  revoked     boolean not null default false
);

alter table public.devices enable row level security;

create policy "Users read own devices"
  on public.devices for select
  using (owner_id = auth.uid());

create policy "Users update own devices"
  on public.devices for update
  using (owner_id = auth.uid());

create policy "Users delete own devices"
  on public.devices for delete
  using (owner_id = auth.uid());

-- 3. DEVICE_SECRETS ------------------------------------------
-- RLS ON, zero policies → no client can ever read/write.
create table public.device_secrets (
  device_id   uuid primary key references public.devices(id) on delete cascade,
  token_hash  text not null
);

alter table public.device_secrets enable row level security;
-- (intentionally no policies)

-- 4. LOCATIONS -----------------------------------------------
create table public.locations (
  id          uuid primary key default gen_random_uuid(),
  device_id   uuid not null references public.devices(id) on delete cascade,
  lat         double precision not null check (lat between -90 and 90),
  lon         double precision not null check (lon between -180 and 180),
  recorded_at timestamptz not null,
  received_at timestamptz not null default now()
);

-- Performance index for history queries
create index idx_locations_device_time
  on public.locations (device_id, recorded_at desc);

-- Idempotent: duplicates silently ignored via ON CONFLICT DO NOTHING
alter table public.locations
  add constraint uq_location_point
  unique (device_id, recorded_at, lat, lon);

alter table public.locations enable row level security;

create policy "Users read own locations"
  on public.locations for select
  using (
    device_id in (
      select id from public.devices where owner_id = auth.uid()
    )
  );

-- No client INSERT – only the Edge Function (service role) inserts.

-- 5. RPC: create_device --------------------------------------
-- SECURITY DEFINER so it can insert into device_secrets.
-- Returns the plaintext token exactly once.
create or replace function public.create_device(p_phone_name text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id    uuid;
  v_device_id  uuid;
  v_token_raw  bytea;
  v_token_hex  text;
  v_token_hash text;
begin
  -- Caller must be authenticated
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Validate phone_name
  if p_phone_name is null
     or char_length(p_phone_name) < 1
     or char_length(p_phone_name) > 50 then
    raise exception 'phone_name must be 1-50 characters';
  end if;

  -- Generate device
  v_device_id := gen_random_uuid();

  insert into public.devices (id, owner_id, phone_name)
  values (v_device_id, v_user_id, p_phone_name);

  -- Generate 32-byte random token → 64-char hex string
  v_token_raw  := gen_random_bytes(32);
  v_token_hex  := encode(v_token_raw, 'hex');

  -- Store only the SHA-256 hash
  v_token_hash := encode(
    extensions.digest(v_token_raw, 'sha256'), 'hex'
  );

  insert into public.device_secrets (device_id, token_hash)
  values (v_device_id, v_token_hash);

  return json_build_object(
    'device_id', v_device_id,
    'token',     v_token_hex
  );
end;
$$;

-- Only authenticated users may call
revoke execute on function public.create_device(text) from anon;
grant  execute on function public.create_device(text) to authenticated;

