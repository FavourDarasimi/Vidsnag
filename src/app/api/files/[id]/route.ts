import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { resolveSafePath } from '@/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mp3':
      return 'audio/mpeg';
    case '.m4a':
      return 'audio/mp4';
    case '.mkv':
      return 'video/x-matroska';
    case '.ogg':
    case '.opus':
      return 'audio/ogg';
    case '.wav':
      return 'audio/wav';
    default:
      return 'application/octet-stream';
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rawId = params.id;

    // Security: Validate file ID to strictly prevent path traversal
    if (!rawId || typeof rawId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(rawId)) {
      return NextResponse.json(
        { error: 'Invalid file identifier.' },
        { status: 400 }
      );
    }

    const downloadDir = path.resolve(process.env.DOWNLOAD_DIR || './downloads');
    if (!fs.existsSync(downloadDir)) {
      return NextResponse.json(
        { error: 'Download directory not found.' },
        { status: 404 }
      );
    }

    // Locate the file matching ${rawId}_* or ${rawId}.*
    const entries = fs.readdirSync(downloadDir);
    const targetEntry = entries.find(
      (entry) =>
        entry.startsWith(`${rawId}_`) ||
        entry.startsWith(`${rawId}.`) ||
        entry === rawId
    );

    if (!targetEntry) {
      return NextResponse.json(
        { error: 'File not found or retention period has expired.' },
        { status: 404 }
      );
    }

    // Strict path traversal verification
    const safeFilePath = resolveSafePath(downloadDir, targetEntry);
    if (!fs.existsSync(safeFilePath) || !fs.statSync(safeFilePath).isFile()) {
      return NextResponse.json(
        { error: 'File could not be accessed.' },
        { status: 404 }
      );
    }

    const stats = fs.statSync(safeFilePath);

    // Clean user-friendly filename for Content-Disposition header
    // Removes the prefix uuid: `${rawId}_`
    let downloadFilename = targetEntry;
    if (downloadFilename.startsWith(`${rawId}_`)) {
      downloadFilename = downloadFilename.substring(rawId.length + 1);
    }
    // Encode filename for Content-Disposition according to RFC 6266
    const asciiFilename = downloadFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const utf8EncodedFilename = encodeURIComponent(downloadFilename);

    const mimeType = getMimeType(safeFilePath);
    const nodeStream = fs.createReadStream(safeFilePath);

    // Convert Node ReadStream to Web ReadableStream
    const readable = new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk) => {
          controller.enqueue(chunk);
        });
        nodeStream.on('end', () => {
          controller.close();
        });
        nodeStream.on('error', (err) => {
          controller.error(err);
        });
      },
      cancel() {
        nodeStream.destroy();
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': mimeType,
        'Content-Length': stats.size.toString(),
        'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${utf8EncodedFilename}`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve file.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
