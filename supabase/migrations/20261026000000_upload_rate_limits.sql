-- ==============================================================================
-- Migration: 20261026000000_upload_rate_limits.sql
-- Description: PostgreSQL-backed anchor-resetting fixed-window rate limiter.
-- Spec: docs/adr/ADR-022-signed-upload-private-storage.md & docs/tickets/T-020.md
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Upload Rate Limits Table
-- ------------------------------------------------------------------------------
create table public.upload_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null,
  constraint upload_rate_limits_request_count_check
    check (request_count >= 1 and request_count <= 6)
);

-- Revoke direct table privileges from client and external roles
revoke all on table public.upload_rate_limits from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. Rate Limit RPC Function
-- ------------------------------------------------------------------------------
create function public.consume_upload_rate_limit(p_user_id uuid)
returns table (
  allowed boolean,
  current_count integer,
  reset_epoch_seconds bigint
)
language plpgsql
security definer
set search_path = ''
set lock_timeout = '75ms'
set statement_timeout = '75ms'
as $$
declare
  v_now timestamptz;
  v_window_start timestamptz;
  v_count integer;
  v_window_seconds constant integer := 60;
  v_max_requests constant integer := 5;
  v_saturation_ceiling constant integer := 6;
begin
  if p_user_id is null then
    return query select false, 0, 0::bigint;
    return;
  end if;

  -- 1. Attempt first-request insertion with request_count = 1
  v_now := pg_catalog.clock_timestamp();
  insert into public.upload_rate_limits (user_id, window_start, request_count)
  values (p_user_id, v_now, 1)
  on conflict (user_id) do nothing
  returning public.upload_rate_limits.window_start, public.upload_rate_limits.request_count
  into v_window_start, v_count;

  if found then
    return query select
      true,
      v_count,
      (extract(epoch from v_window_start) + v_window_seconds)::bigint;
    return;
  end if;

  -- 2. Conflict path: lock existing user row
  select public.upload_rate_limits.window_start, public.upload_rate_limits.request_count
  into v_window_start, v_count
  from public.upload_rate_limits
  where public.upload_rate_limits.user_id = p_user_id
  for update;

  if not found then
    -- Fail-closed if row was concurrently deleted
    return query select false, 0, 0::bigint;
    return;
  end if;

  -- 3. Sample timestamp AFTER acquiring row lock
  v_now := pg_catalog.clock_timestamp();

  if v_now >= v_window_start + (v_window_seconds * interval '1 second') then
    -- Window has expired: anchor-reset to current timestamp and counter = 1
    v_window_start := v_now;
    v_count := 1;
  else
    -- Window still active: increment counter up to saturation ceiling (6)
    v_count := least(v_count + 1, v_saturation_ceiling);
  end if;

  update public.upload_rate_limits
  set window_start = v_window_start,
      request_count = v_count
  where public.upload_rate_limits.user_id = p_user_id;

  return query select
    (v_count <= v_max_requests),
    v_count,
    (extract(epoch from v_window_start) + v_window_seconds)::bigint;
  return;
end;
$$;

-- ------------------------------------------------------------------------------
-- 3. Function Ownership & Privileges
-- ------------------------------------------------------------------------------
alter function public.consume_upload_rate_limit(uuid) owner to postgres;
revoke all on function public.consume_upload_rate_limit(uuid) from public, anon, authenticated;
grant execute on function public.consume_upload_rate_limit(uuid) to service_role;
