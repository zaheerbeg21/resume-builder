import React from 'react';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { renderToBuffer, Document } from '@react-pdf/renderer';
import { PDFParse } from 'pdf-parse';
import { createClient } from '@/lib/db/supabase-server';
import { getServiceRoleClient, hasActivePass } from '@/lib/billing/entitlements';
import { recordUsageEvent } from '@/lib/db/usage-events';
import { registerFonts } from '@/lib/pdf/fonts';
import { ResumeDocument } from '@/lib/pdf/templates/standard';
import { ClassicResumeDocument } from '@/lib/pdf/templates/classic';
import { lintExtractedText } from '@/lib/pdf/lint';
import type { Resume } from '@/types/resume';

const ExportPayloadSchema = z.object({
  resumeId: z.string().uuid('Invalid resume ID format'),
  template: z.string().optional(),
});

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

  const parseResult = ExportPayloadSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parseResult.error.issues },
      { status: 400 }
    );
  }

  const { resumeId, template: payloadTemplate } = parseResult.data;

  const { data: resumeRecord, error: dbError } = await supabase
    .from('resumes')
    .select('*')
    .eq('id', resumeId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  if (!resumeRecord) {
    return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
  }

  const resumeData = resumeRecord.content as Resume;
  const chosenTemplate = payloadTemplate || resumeRecord.template || 'standard';

  // 1. Entitlement & free-tier export quota gate
  const admin = getServiceRoleClient();
  const passActive = await hasActivePass(user.id, admin);

  if (!passActive) {
    const { count, error: quotaError } = await admin
      .from('usage_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('route', '/api/pdf/export');

    if (quotaError) {
      return NextResponse.json(
        { error: 'Export quota check unavailable. Try again shortly.' },
        { status: 503 }
      );
    }

    if ((count ?? 0) >= 1) {
      return NextResponse.json(
        {
          error: 'Free export limit reached. Upgrade to the 30-day pass for unlimited exports.',
          code: 'EXPORT_LIMIT_REACHED',
        },
        { status: 402 }
      );
    }
  }

  const startMs = Date.now();

  // 2. Render PDF buffer server-side
  registerFonts();
  const DocumentComponent =
    chosenTemplate === 'classic' ? ClassicResumeDocument : ResumeDocument;
  const documentElement = React.createElement(DocumentComponent, {
    resume: resumeData,
  }) as unknown as React.ReactElement<React.ComponentProps<typeof Document>>;

  const pdfBuffer = await renderToBuffer(documentElement);

  // 3. Extract text with pdf-parse v2 class API
  const parser = new PDFParse({ data: pdfBuffer });
  let extractedText = '';
  try {
    const parseResultText = await parser.getText();
    extractedText = parseResultText.text;
  } finally {
    await parser.destroy();
  }

  // 4. Pre-flight ATS linting (never charge an export if lint fails)
  const lintResult = lintExtractedText(extractedText, resumeData);

  if (!lintResult.passed || lintResult.errors.length > 0) {
    return NextResponse.json(
      {
        error: 'ATS lint failed',
        diagnostics: lintResult.errors,
      },
      { status: 422 }
    );
  }

  // 5. Record clean export telemetry before returning PDF stream
  await recordUsageEvent(
    {
      userId: user.id,
      route: '/api/pdf/export',
      provider: 'internal',
      model: chosenTemplate,
      latencyMs: Date.now() - startMs,
    },
    { adminClient: admin }
  );

  // 6. Return PDF stream with download attachment headers
  const rawName = (resumeData.basics?.fullName || 'Candidate').trim();
  const sanitizedName =
    rawName
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'Candidate';
  const filename = `${sanitizedName}_Resume.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(pdfBuffer.byteLength),
    },
  });
}
