import { NextResponse } from 'next/server';
import { createClient } from '@/lib/db/supabase-server';
import { ResumeSchema } from '@/types/resume';

const MAX_RESUMES = 5;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: resumes, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(resumes ?? [], { status: 200 });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const bodyObj = body as Record<string, unknown>;
  const rawContent =
    bodyObj.content && typeof bodyObj.content === 'object' && 'basics' in bodyObj.content
      ? bodyObj.content
      : bodyObj;

  const validation = ResumeSchema.safeParse(rawContent);
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.issues },
      { status: 400 }
    );
  }

  // Pre-flight quota check: maximum 5 resumes per user
  const { count, error: countError } = await supabase
    .from('resumes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  if (count !== null && count >= MAX_RESUMES) {
    return NextResponse.json(
      { error: 'Resume limit reached. Maximum 5 resumes allowed.' },
      { status: 403 }
    );
  }

  const title =
    typeof bodyObj.title === 'string' && bodyObj.title.trim()
      ? bodyObj.title.trim()
      : validation.data.basics.fullName
      ? `${validation.data.basics.fullName} Resume`
      : 'Untitled Resume';

  const template =
    typeof bodyObj.template === 'string' && bodyObj.template.trim()
      ? bodyObj.template.trim()
      : 'standard';

  const { data, error } = await supabase
    .from('resumes')
    .insert({
      user_id: user.id,
      title,
      template,
      content: validation.data,
      schema_version: 1,
    })
    .select()
    .single();

  if (error) {
    if (
      error.code === 'P0001' ||
      error.message?.includes('Quota exceeded') ||
      error.message?.includes('5 resumes')
    ) {
      return NextResponse.json(
        { error: 'Resume limit reached. Maximum 5 resumes allowed.' },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
