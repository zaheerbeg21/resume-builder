import { NextResponse } from 'next/server';
import { createClient } from '@/lib/db/supabase-server';
import {
  ResumeUploadError,
  checkAndConsumeUploadRateLimit,
  createSignedResumeUploadUrl,
} from '@/lib/storage/resume-upload';

export async function POST(request?: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = await checkAndConsumeUploadRateLimit(user.id, {
    signal: request?.signal,
  });

  if (!rateLimit.allowed) {
    if (rateLimit.isAmbiguousFailure) {
      return NextResponse.json(
        { error: 'Upload rate limit service unavailable. Try again shortly.' },
        {
          status: 503,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds ?? 5),
          },
        },
      );
    }

    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again shortly.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.retryAfterSeconds ?? 60),
        },
      },
    );
  }

  try {
    const result = await createSignedResumeUploadUrl(user.id);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof ResumeUploadError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode },
      );
    }
    return NextResponse.json(
      { error: 'Failed to create signed upload URL.' },
      { status: 500 },
    );
  }
}
