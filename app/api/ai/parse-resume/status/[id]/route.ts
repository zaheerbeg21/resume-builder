import { NextResponse } from 'next/server';
import { createClient } from '@/lib/db/supabase-server';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. Authenticate user
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id || !UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Invalid job ID format' }, { status: 400 });
  }

  // 2. Fetch parse_job matching id and user_id (defense-in-depth alongside RLS)
  const { data: job, error: jobError } = await supabase
    .from('parse_jobs')
    .select('id, status, result, error, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // 3. Format response
  let parsedError = undefined;
  if (job.error) {
    try {
      parsedError = JSON.parse(job.error);
    } catch {
      parsedError = job.error;
    }
  }

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    result: job.result ?? undefined,
    error: parsedError,
  });
}
