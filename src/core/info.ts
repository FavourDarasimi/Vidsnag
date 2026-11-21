import { spawn } from 'child_process';
import { VideoInfo, FormatOption } from './types';
import { validateUrl } from './validate';
import { assertDependencies } from './check-deps';

/**
 * Formats a duration in seconds into a human-readable string (e.g., 03:45 or 01:12:30).
 */
export function formatDuration(seconds?: number): string {
  if (seconds === undefined || seconds === null || isNaN(seconds) || seconds < 0) {
    return '00:00';
  }
  const totalSeconds = Math.floor(seconds);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

/**
 * Fetches video metadata by executing `yt-dlp --dump-json` safely via child_process.spawn.
 */
export async function getVideoInfo(rawUrl: string): Promise<VideoInfo> {
  const url = validateUrl(rawUrl);
  await assertDependencies(false);

  return new Promise((resolve, reject) => {
    // Invoke yt-dlp with arguments array, never passing to a shell
    const args = [
      '--dump-json',
      '--no-playlist',
      '--no-warnings',
      '--skip-download',
      url,
    ];

    const child = spawn('yt-dlp', args, { shell: false });
    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', (chunk) => {
      stdoutData += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const errorMsg = stderrData.trim() || `yt-dlp exited with code ${code}`;
        if (errorMsg.includes('Unsupported URL') || errorMsg.includes('is not a valid URL')) {
          reject(new Error('The provided URL is not supported or not recognized as a valid video link.'));
        } else if (errorMsg.includes('Video unavailable') || errorMsg.includes('Private video')) {
          reject(new Error('This video is private, unavailable, or requires authentication.'));
        } else if (errorMsg.includes('Sign in to confirm your age')) {
          reject(new Error('This video is age-restricted and requires account verification.'));
        } else {
          // Provide first concise error line
          const firstErrLine = errorMsg.split('\n').filter((l) => l.startsWith('ERROR:') || l.includes('Error'))[0] || errorMsg.split('\n')[0];
          reject(new Error(firstErrLine.replace(/^ERROR:\s*/, '')));
        }
        return;
      }

      try {
        const data = JSON.parse(stdoutData.trim());
        const rawFormats: FormatOption[] = Array.isArray(data.formats)
          ? data.formats.map((f: Record<string, unknown>) => ({
              formatId: String(f.format_id || ''),
              ext: String(f.ext || ''),
              resolution: typeof f.resolution === 'string' ? f.resolution : undefined,
              height: typeof f.height === 'number' ? f.height : undefined,
              filesize: typeof f.filesize === 'number' ? f.filesize : (typeof f.filesize_approx === 'number' ? f.filesize_approx : undefined),
              hasVideo: f.vcodec !== 'none' && Boolean(f.vcodec),
              hasAudio: f.acodec !== 'none' && Boolean(f.acodec),
              tbr: typeof f.tbr === 'number' ? f.tbr : undefined,
            }))
          : [];

        // Extract available video quality heights
        const heightsSet = new Set<number>();
        rawFormats.forEach((f) => {
          if (f.height && f.height > 0) {
            heightsSet.add(f.height);
          }
        });

        const sortedHeights = Array.from(heightsSet).sort((a, b) => b - a);
        const qualityOptions = ['best', ...sortedHeights.map((h) => `${h}p`)];

        // Sensible default format choices
        const availableFormats = ['mp4', 'webm', 'mp3'];

        const info: VideoInfo = {
          id: data.id || 'unknown',
          title: data.title || 'Untitled Video',
          description: data.description || '',
          duration: typeof data.duration === 'number' ? data.duration : 0,
          durationString: formatDuration(data.duration),
          thumbnail: data.thumbnail || '',
          uploader: data.uploader || data.channel || data.uploader_id || 'Unknown creator',
          url,
          webpageUrl: data.webpage_url || url,
          availableQualities: qualityOptions.length > 1 ? qualityOptions : ['best', '1080p', '720p', '480p', '360p'],
          availableFormats,
          rawFormats,
        };

        resolve(info);
      } catch (err: unknown) {
        const parseError = err instanceof Error ? err.message : String(err);
        reject(new Error(`Failed to parse video metadata: ${parseError}`));
      }
    });
  });
}
