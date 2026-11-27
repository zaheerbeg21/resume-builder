-- ==============================================================================
-- Migration: 20261025000000_resumes_raw_storage.sql
-- Description: Private resumes-raw Storage bucket, Storage RLS, and parse_jobs.
-- Spec: docs/adr/ADR-022-signed-upload-private-storage.md & docs/tickets/T-020.md
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Private Storage Bucket (resumes-raw: 5 MB max, application/pdf only)
-- ------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes-raw',
  'resumes-raw',
  false,
  5242880,
  array['application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------------------------
-- 2. Storage Object RLS Policies (${auth.uid()}/<upload_id>.pdf; DELETE = service role only)
-- ------------------------------------------------------------------------------
-- Note: RLS is already enabled on storage.objects in Supabase; altering storage.objects
-- from the SQL Editor can fail with "must be owner of table objects".

drop policy if exists resumes_raw_insert_own on storage.objects;
create policy resumes_raw_insert_own on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'resumes-raw'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists resumes_raw_select_own on storage.objects;
create policy resumes_raw_select_own on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'resumes-raw'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ------------------------------------------------------------------------------
-- 3. Parse Jobs Table (async 202 import job polling)
-- ------------------------------------------------------------------------------
create table if not exists public.parse_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  result jsonb,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '1 hour')
);

create index if not exists idx_parse_jobs_user_id on public.parse_jobs(user_id);
create index if not exists idx_parse_jobs_expires_at on public.parse_jobs(expires_at);

alter table public.parse_jobs enable row level security;

drop policy if exists own_jobs on public.parse_jobs;
create policy own_jobs on public.parse_jobs
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Keep updated_at synced on parse_jobs update
create or replace function public.update_parse_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_parse_jobs_updated_at_trigger on public.parse_jobs;
create trigger update_parse_jobs_updated_at_trigger
  before update on public.parse_jobs
  for each row execute function public.update_parse_jobs_updated_at();