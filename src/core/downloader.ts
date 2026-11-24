import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import {
  DownloadOptions,
  DownloadProgressEvent,
  DownloadProgressStatus,
  DownloadResult,
} from './types';
import { validateUrl, sanitizeFilename } from './validate';
import { assertDependencies } from './check-deps';

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  switch (ext) {
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
      return 'audio/mp4';
    case 'mkv':
      return 'video/x-matroska';
    case 'ogg':
    case 'opus':
      return 'audio/ogg';
    case 'wav':
      return 'audio/wav';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Executes yt-dlp to download video or audio, streaming real-time progress events.
 */
export async function downloadVideo(options: DownloadOptions): Promise<DownloadResult> {
  const url = validateUrl(options.url);
  await assertDependencies(true);

  const downloadId = options.downloadId || crypto.randomUUID();
  const rawOutputDir = options.outputDir || process.env.DOWNLOAD_DIR || './downloads';
  const outputDir = path.resolve(rawOutputDir);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const format = (options.format || 'mp4').toLowerCase();
  const quality = (options.quality || 'best').toLowerCase();

  const emitProgress = (
    status: DownloadProgressStatus,
    percent: number,
    speed: string = '',
    eta: string = '',
    downloadedBytes: number = 0,
    totalBytes: number = 0,
    filename?: string,
    error?: string
  ) => {
    if (options.onProgress) {
      options.onProgress({
        downloadId,
        status,
        percent: Math.min(100, Math.max(0, percent)),
        speed,
        eta,
        downloadedBytes,
        totalBytes,
        filename,
        error,
      });
    }
  };

  // Initial event
  emitProgress('starting', 0, '', '', 0, 0);

  // Build safe yt-dlp arguments array
  const args: string[] = [
    '--no-playlist',
    '--newline',
    '--no-warnings',
    '--progress',
    '--progress-template',
    'download:PROGRESS|{progress._percent_str}|{progress._total_bytes_str}|{progress._speed_str}|{progress._eta_str}|{progress.downloaded_bytes}|{progress.total_bytes}',
    '--print',
    'after_move:filepath',
  ];

  // Output template
  if (options.customFilename) {
    const safeName = sanitizeFilename(options.customFilename);
    args.push('-o', path.join(outputDir, safeName));
  } else {
    // Prefix with downloadId so the web server can uniquely locate the file
    args.push('-o', path.join(outputDir, `${downloadId}_%(title).100B.%(ext)s`));
  }

  // Format selection
  if (format === 'mp3') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else if (format === 'webm') {
    if (quality !== 'best' && quality.endsWith('p')) {
      const height = parseInt(quality.replace('p', ''), 10);
      if (!isNaN(height)) {
        args.push(
          '-f',
          `bestvideo[height<=${height}][ext=webm]+bestaudio[ext=webm]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`
        );
      } else {
        args.push('-f', 'bestvideo[ext=webm]+bestaudio[ext=webm]/bestvideo+bestaudio/best');
      }
    } else {
      args.push('-f', 'bestvideo[ext=webm]+bestaudio[ext=webm]/bestvideo+bestaudio/best');
    }
    args.push('--merge-output-format', 'webm');
  } else {
    // Default: mp4
    if (quality !== 'best' && quality.endsWith('p')) {
      const height = parseInt(quality.replace('p', ''), 10);
      if (!isNaN(height)) {
        args.push(
          '-f',
          `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`
        );
      } else {
        args.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best');
      }
    } else {
      args.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best');
    }
    args.push('--merge-output-format', 'mp4');
  }

  args.push(url);

  return new Promise<DownloadResult>((resolve, reject) => {
    const child = spawn('yt-dlp', args, { shell: false });
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let finalFilePath: string | null = null;
    let lastPercent = 0;

    const parseProgressLine = (line: string) => {
      const trimmed = line.trim();

      // Check if this line is our print after_move filepath
      if (
        (trimmed.startsWith('/') || (process.platform === 'win32' && /^[a-zA-Z]:\\/.test(trimmed))) &&
        fs.existsSync(trimmed)
      ) {
        finalFilePath = trimmed;
        return;
      }

      // Check for structured progress template
      if (trimmed.startsWith('download:PROGRESS|')) {
        const parts = trimmed.split('|');
        const percentStr = parts[1]?.replace('%', '').trim() || '0';
        const speedStr = parts[3]?.trim() || '';
        const etaStr = parts[4]?.trim() || '';
        const downloadedBytes = parseInt(parts[5]?.trim() || '0', 10) || 0;
        const totalBytes = parseInt(parts[6]?.trim() || '0', 10) || 0;

        const percent = parseFloat(percentStr);
        if (!isNaN(percent)) {
          lastPercent = percent;
          emitProgress(
            'downloading',
            percent,
            speedStr,
            etaStr,
            downloadedBytes,
            totalBytes
          );
        }
        return;
      }

      // Fallback regex for standard yt-dlp output
      // e.g. [download]  45.2% of 15.20MiB at  2.50MiB/s ETA 00:03
      const standardMatch = trimmed.match(
        /\[download\]\s+([\d.]+)%\s+of\s+([~0-9.]+\w+)\s+at\s+([~0-9.]+\w+\/s)\s+ETA\s+([\d:]+)/
      );
      if (standardMatch) {
        const percent = parseFloat(standardMatch[1]);
        const speed = standardMatch[3];
        const eta = standardMatch[4];
        lastPercent = percent;
        emitProgress('downloading', percent, speed, eta, 0, 0);
        return;
      }

      // Processing / merging stage
      if (
        trimmed.includes('[Merger]') ||
        trimmed.includes('[ExtractAudio]') ||
        trimmed.includes('[Fixup') ||
        trimmed.includes('Merging formats')
      ) {
        emitProgress('processing', Math.max(lastPercent, 98), 'Merging / Converting...', 'Almost done');
      }
    };

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString();
      // Split on both newlines and carriage returns; yt-dlp uses \r to overwrite progress lines
      const lines = stdoutBuffer.split(/[\r\n]+/);
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim()) {
          parseProgressLine(line);
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderrBuffer += chunk.toString();
    });

    child.on('error', (err) => {
      emitProgress('error', 0, '', '', 0, 0, undefined, err.message);
      reject(new Error(`Failed to execute yt-dlp: ${err.message}`));
    });

    child.on('close', (code) => {
      // Process remaining buffer
      if (stdoutBuffer.trim()) {
        parseProgressLine(stdoutBuffer);
      }

      if (code !== 0) {
        const errMsg = stderrBuffer.trim() || `Download process exited with code ${code}`;
        const cleanMsg = errMsg.split('\n').filter((l) => l.startsWith('ERROR:') || l.includes('Error'))[0] || errMsg.split('\n')[0];
        emitProgress('error', 0, '', '', 0, 0, undefined, cleanMsg);
        reject(new Error(cleanMsg.replace(/^ERROR:\s*/, '')));
        return;
      }

      // If after_move:filepath wasn't captured directly, scan outputDir for matching downloadId
      if (!finalFilePath || !fs.existsSync(finalFilePath)) {
        try {
          const files = fs.readdirSync(outputDir);
          const found = files.find((f) => f.startsWith(`${downloadId}_`));
          if (found) {
            finalFilePath = path.join(outputDir, found);
          }
        } catch {
          // ignore
        }
      }

      if (!finalFilePath || !fs.existsSync(finalFilePath)) {
        const err = 'Downloaded file could not be located in output directory.';
        emitProgress('error', 0, '', '', 0, 0, undefined, err);
        reject(new Error(err));
        return;
      }

      const stats = fs.statSync(finalFilePath);
      const filename = path.basename(finalFilePath);
      const mimeType = getMimeType(filename);

      emitProgress('completed', 100, '', '', stats.size, stats.size, filename);

      resolve({
        downloadId,
        filePath: finalFilePath,
        filename,
        fileSize: stats.size,
        mimeType,
      });
    });
  });
}
