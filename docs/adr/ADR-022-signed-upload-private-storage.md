# ADR-022: Signed-URL Direct Upload to Private Supabase Storage & Async Job Parsing

- **Status:** Proposed
- **Date:** 2026-10-25
- **Author:** Solution Architect / Security Reviewer
- **Blueprint Reference:** docs/BLUEPRINT.md §4, §10

## 1. Context & Problem Statement
The Blueprint (§10) specifies a 5 MB maximum file size limit for resume uploads. However, serverless deployment on Vercel imposes a maximum HTTP request body payload size of approximately 4.5 MB (*verify in current Vercel docs*). When users upload PDFs near the 5 MB ceiling directly via `POST /api/ai/parse-resume`, edge infrastructure risks rejecting the request with HTTP 413 (`FUNCTION_PAYLOAD_TOO_LARGE`) before route code executes. Furthermore, buffering multipart payloads directly in serverless execution memory increases memory pressure.

Additionally, because the host Vercel plan and maximum serverless function duration are unconfirmed (*verify in current Vercel docs*), worst-case execution across retry and failover chains cannot be guaranteed to complete within unknown synchronous serverless function limits.

## 2. Decision

1. **Private Storage Bucket (`resumes-raw`):**
   - Resumes are never transmitted directly in the parsing route's HTTP request body.
   - Uploads target a dedicated private Supabase Storage bucket named `resumes-raw`.
   - The bucket is configured with `public = false`.
   - Bucket configurations strictly enforce a 5 MB file size limit (`file_size_limit = 5242880`) and restrict MIME types to `application/pdf` (`allowed_mime_types = ['application/pdf']`).

2. **Per-User Path Isolation & Row Level Security (RLS):**
   - File objects must follow the storage path convention: `${user_id}/${upload_id}.pdf`, where `upload_id` is a crypto UUID generated server-side.
   - Supabase Storage RLS policies ensure authenticated users can only write and read objects prefixed with their own `auth.uid()`:
     - `INSERT`: `bucket_id = 'resumes-raw' AND (storage.foldername(name))[1] = auth.uid()::text`
     - `SELECT`: `bucket_id = 'resumes-raw' AND (storage.foldername(name))[1] = auth.uid()::text`
     - `DELETE`: Service role only.

3. **Short-Lived Single-Use Signed URLs:**
   - Client requests an upload token via `POST /api/resumes/upload-url`.
   - The route validates authentication, user quota, and a dedicated rate limit (starting value: maximum 5 upload-URL requests per user per minute).
   - Generates a short-lived (expiry starting value: 120 seconds) pre-signed upload URL scoped to `${user_id}/${upload_id}.pdf`.

4. **Async 202 Job Architecture & `parse_jobs` Table:**
   - Because function execution ceilings are unconfirmed, resume parsing defaults to an asynchronous job pattern with client polling.
   - `POST /api/ai/parse-resume` validates `storagePath`, checks `%PDF` magic bytes, inserts a row into `parse_jobs`, initiates background processing (or triggers a background worker/edge task), and immediately returns HTTP 202 Accepted:
     ```json
     { "jobId": "uuid", "status": "pending", "pollUrl": "/api/ai/parse-resume/status/uuid" }
     ```
   - Client polls `GET /api/ai/parse-resume/status/[jobId]` (backed by RLS on `parse_jobs`).
   - *Synchronous Simplification Note:* If production Vercel function duration is subsequently confirmed to comfortably accommodate worst-case chain latency (*verify in current Vercel docs*), the route may optionally be simplified to synchronous execution without changing the client upload protocol.

5. **`parse_jobs` Schema & Lifecycle:**
   ```sql
   create table parse_jobs (
     id uuid primary key default gen_random_uuid(),
     user_id uuid not null references profiles on delete cascade,
     storage_path text not null,
     status text not null default 'pending', -- 'pending' | 'processing' | 'completed' | 'failed'
     result jsonb,
     error text,
     created_at timestamptz default now(),
     updated_at timestamptz default now(),
     expires_at timestamptz default (now() + interval '1 hour')
   );
   alter table parse_jobs enable row level security;
   create policy own_jobs on parse_jobs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
   ```

6. **Server Pre-Flight Verification & Magic-Byte Guard:**
   - Server authenticates user and asserts:
     - `storagePath` begins with `${user.id}/`.
     - File exists in `resumes-raw` and reported metadata size $\le 5\text{ MB}$.
     - Server reads the first 4 bytes and asserts PDF magic bytes: `%PDF` (`0x25 0x50 0x44 0x46`). If invalid, aborts with HTTP 422.

7. **Storage Cleanup & Deletion:**
   - Once file content is retrieved for parsing, deletion from `resumes-raw` is executed in a guaranteed `finally` block via the Supabase Service Role client.
   - A scheduled cleanup job (Supabase pg_cron or GitHub Action) sweeps orphaned storage objects and expired `parse_jobs` older than 1 hour.

## 3. Consequences
- **Positive:** Bypasses Vercel serverless request body limits; eliminates server-side memory buffering of raw uploads; avoids function execution timeouts via asynchronous job polling; guarantees tenant isolation and immediate PII purge.
- **Negative / Trade-off:** Requires polling coordination on the frontend and management of the `parse_jobs` state table.
