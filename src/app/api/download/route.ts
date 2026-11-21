import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  downloadVideo,
  downloadOptionsSchema,
  downloadQueue,
  apiRateLimiter,
  cleanupOldDownloads,
} from '@/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1';

  // 1. Rate Limiting Check
  const rateLimit = apiRateLimiter.check(clientIp);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Rate limit reached. Please wait ${Math.ceil(rateLimit.resetMs / 1000)}s.`,
      },
      { status: 429 }
    );
  }

  // 2. Parse and validate payload
  const body = await req.json().catch(() => null);
  const parsed = downloadOptionsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid download parameters.' },
      { status: 400 }
    );
  }

  const { url, format, quality } = parsed.data;
  const downloadId = crypto.randomUUID();

  // Run periodic cleanup in the background
  cleanupOldDownloads();

  const textEncoder = new TextEncoder();

  // 3. Stream response via Server-Sent Events (SSE)
  const stream = new ReadableStream({
    async start(controller) {
      let releaseSlot: (() => void) | null = null;

      const sendEvent = (event: string, data: Record<string, unknown>) => {
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(textEncoder.encode(payload));
        } catch {
          // Client disconnected
        }
      };

      try {
        // Concurrency Control: Notify client if waiting in queue
        if (downloadQueue.active >= downloadQueue.max) {
          sendEvent('progress', {
            downloadId,
            status: 'starting',
            percent: 0,
            speed: '',
            eta: '',
            message: `Waiting for download slot (${downloadQueue.active}/${downloadQueue.max} active)...`,
          });
        }

        releaseSlot = await downloadQueue.acquire();

        sendEvent('progress', {
          downloadId,
          status: 'starting',
          percent: 0,
          speed: '',
          eta: '',
          message: 'Connecting to media server...',
        });

        const result = await downloadVideo({
          url,
          format,
          quality,
          downloadId,
          onProgress: (event) => {
            sendEvent('progress', { ...event });
          },
        });

        sendEvent('complete', {
          downloadId,
          filename: result.filename,
          fileSize: result.fileSize,
          mimeType: result.mimeType,
          downloadUrl: `/api/files/${downloadId}`,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        sendEvent('error', {
          downloadId,
          message,
        });
      } finally {
        if (releaseSlot) {
          releaseSlot();
        }
        try {
          controller.close();
        } catch {
          // ignore if already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform, no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering if proxied
    },
  });
}
