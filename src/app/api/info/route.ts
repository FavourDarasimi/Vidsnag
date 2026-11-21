import { NextRequest, NextResponse } from 'next/server';
import { getVideoInfo, apiRateLimiter, urlSchema } from '@/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // 1. IP Rate Limiting
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';

    const rateLimit = apiRateLimiter.check(clientIp);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many requests. Please wait ${Math.ceil(rateLimit.resetMs / 1000)} seconds before trying again.`,
        },
        { status: 429 }
      );
    }

    // 2. Body parsing and validation
    const body = await req.json().catch(() => null);
    if (!body || typeof body.url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid video URL.' },
        { status: 400 }
      );
    }

    const validation = urlSchema.safeParse(body.url);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0]?.message || 'Invalid URL' },
        { status: 400 }
      );
    }

    // 3. Fetch metadata via core
    const info = await getVideoInfo(validation.data);

    return NextResponse.json({
      success: true,
      data: info,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve video information.';
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 400 }
    );
  }
}
