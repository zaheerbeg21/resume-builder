-- ==============================================================================
-- Migration: 20261021000000_initial_schema.sql
-- Description: Core PostgreSQL data model, RLS policies, and database triggers.
-- Spec: docs/BLUEPRINT.md Section 5 & docs/tickets/T-004.md
-- ==============================================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. Profiles Table (1:1 with auth.users)
-- ------------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------------------------
-- 2. Resumes Table
-- ------------------------------------------------------------------------------
create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  template text not null default 'standard',
  content jsonb not null,
  schema_version int not null default 1,
  updated_at timestamptz default now()
);

create index if not exists idx_resumes_user_id on public.resumes(user_id);

-- ------------------------------------------------------------------------------
-- 3. JD Targets Table
-- ------------------------------------------------------------------------------
create table if not exists public.jd_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  resume_id uuid not null references public.resumes(id) on delete cascade,
  jd_hash text not null,
  analysis jsonb not null,
  created_at timestamptz default now()
);

create index if not exists idx_jd_targets_user_id on public.jd_targets(user_id);
create index if not exists idx_jd_targets_resume_id on public.jd_targets(resume_id);

-- ------------------------------------------------------------------------------
-- 4. Entitlements Table (Subscriptions & Passes)
-- ------------------------------------------------------------------------------
create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  stripe_session_id text unique,
  status text not null default 'active'
);

create index if not exists idx_entitlements_user_id on public.entitlements(user_id);

-- ------------------------------------------------------------------------------
-- 5. Stripe Events Table (Idempotency ledger)
-- ------------------------------------------------------------------------------
create table if not exists public.stripe_events (
  event_id text primary key,
  type text not null,
  processed_at timestamptz default now()
);

-- ------------------------------------------------------------------------------
-- 6. Usage Events Table (Telemetry, audit, spend control)
-- ------------------------------------------------------------------------------
create table if not exists public.usage_events (
  id bigserial primary key,
  user_id uuid references public.profiles(id) on delete set null,
  route text not null,
  provider text not null,              -- 'gemini' | 'openai-compatible' | 'fake'
  model text not null,                 -- active model identifier
  failed_over_from text,               -- null if primary succeeded, else initial provider name
  latency_ms int,                      -- round-trip execution latency in ms
  input_tokens int,
  output_tokens int,
  est_cost_usd numeric(10,6),          -- preliminary estimate replaced/reconciled by telemetry
  created_at timestamptz default now()
);

create index if not exists idx_usage_events_user_id on public.usage_events(user_id);

-- ------------------------------------------------------------------------------
-- 7. Row Level Security (RLS)
-- ------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.resumes enable row level security;
alter table public.jd_targets enable row level security;
alter table public.entitlements enable row level security;
alter table public.stripe_events enable row level security;
alter table public.usage_events enable row level security;

-- Profiles: users can select their own profile
drop policy if exists own_rows on public.profiles;
create policy own_rows on public.profiles
  for select using (id = auth.uid());

-- Resumes: users own their rows for all operations
drop policy if exists own_rows on public.resumes;
create policy own_rows on public.resumes
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- JD Targets: users own their rows for all operations
drop policy if exists own_rows on public.jd_targets;
create policy own_rows on public.jd_targets
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Entitlements: users can read their own entitlements; writes restricted to service role
drop policy if exists read_own on public.entitlements;
create policy read_own on public.entitlements
  for select using (user_id = auth.uid());

-- stripe_events & usage_events: RLS enabled with zero anon/authenticated policies.
-- Writes and reads are strictly restricted to the service role (which bypasses RLS).

-- ------------------------------------------------------------------------------
-- 8. Functions and Database Triggers
-- ------------------------------------------------------------------------------

-- Trigger 1: Automatic Profile creation on auth.users insert
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger 2: Enforce hard limit of 5 resumes per user
create or replace function public.enforce_resume_limit()
returns trigger
language plpgsql
as $$
declare
  resume_count int;
begin
  select count(*) into resume_count
  from public.resumes
  where user_id = new.user_id;

  if resume_count >= 5 then
    raise exception 'Quota exceeded: Users may not create more than 5 resumes.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_resume_limit_trigger on public.resumes;
create trigger enforce_resume_limit_trigger
  before insert on public.resumes
  for each row execute function public.enforce_resume_limit();

-- Alias function for enforce_resume_quota (Ticket T-004 nomenclature compatibility)
create or replace function public.enforce_resume_quota()
returns trigger
language plpgsql
as $$
begin
  return public.enforce_resume_limit();
end;
$$;

-- Trigger 3: Keep updated_at synced on resumes update
create or replace function public.update_resumes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_resumes_updated_at_trigger on public.resumes;
create trigger update_resumes_updated_at_trigger
  before update on public.resumes
  for each row execute function public.update_resumes_updated_at();
