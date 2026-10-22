import { NextResponse } from 'next/server';
import { createClient } from '@/lib/db/supabase-server';
import { ResumeSchema } from '@/types/resume';

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export async function GET(request: Request, context: RouteContext) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await Promise.resolve(context.params);
  if (!id) {
    return NextResponse.json({ error: 'Resume ID is required' }, { status: 400 });
  }

  const { data: resume, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!resume) {
    return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
  }

  return NextResponse.json(resume, { status: 200 });
}

export async function PUT(request: Request, context: RouteContext) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await Promise.resolve(context.params);
  if (!id) {
    return NextResponse.json({ error: 'Resume ID is required' }, { status: 400 });
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

  const updatePayload: Record<string, unknown> = {
    content: validation.data,
    updated_at: new Date().toISOString(),
  };

  if (typeof bodyObj.title === 'string' && bodyObj.title.trim()) {
    updatePayload.title = bodyObj.title.trim();
  }
  if (typeof bodyObj.template === 'string' && bodyObj.template.trim()) {
    updatePayload.template = bodyObj.template.trim();
  }

  const { data, error } = await supabase
    .from('resumes')
    .update(updatePayload)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
  }

  return NextResponse.json(data, { status: 200 });
}

export async function DELETE(request: Request, context: RouteContext) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await Promise.resolve(context.params);
  if (!id) {
    return NextResponse.json({ error: 'Resume ID is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('resumes')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
