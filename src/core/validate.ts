import { z } from 'zod';
import path from 'path';

// Validates that a string is a valid HTTP or HTTPS URL
export const urlSchema = z
  .string()
  .trim()
  .min(1, 'URL cannot be empty')
  .refine(
    (val) => {
      try {
        const parsed = new URL(val);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    },
    {
      message: 'Invalid URL. Only HTTP and HTTPS URLs are allowed.',
    }
  );

// Supported formats
export const formatSchema = z
  .enum(['mp4', 'webm', 'mp3', 'mkv', 'm4a', 'best'])
  .default('mp4');

// Supported quality levels
export const qualitySchema = z
  .enum(['best', '2160p', '1440p', '1080p', '720p', '480p', '360p', '240p', '144p'])
  .default('best');

// Validation schema for download request options
export const downloadOptionsSchema = z.object({
  url: urlSchema,
  format: formatSchema.optional().default('mp4'),
  quality: qualitySchema.optional().default('best'),
  outputDir: z.string().optional(),
  customFilename: z.string().optional(),
});

/**
 * Validates a video URL. Throws an error with a user-friendly message if invalid.
 */
export function validateUrl(url: string): string {
  const result = urlSchema.safeParse(url);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message || 'Invalid URL provided.');
  }
  return result.data;
}

/**
 * Sanitizes a filename to prevent path traversal and remove illegal filesystem characters.
 */
export function sanitizeFilename(filename: string): string {
  // Strip control characters, quotes, and dangerous filesystem separators
  const base = path.basename(filename);
  const sanitized = base
    .replace(/[\x00-\x1f\x80-\x9f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/^\.+/, '') // remove leading dots (hidden files or relative traversal)
    .trim();

  return sanitized || 'download';
}

/**
 * Safely resolves a file path within an allowed base directory to prevent path traversal attacks.
 * Throws an error if the resolved path escapes the base directory.
 */
export function resolveSafePath(baseDir: string, targetFilenameOrRelativePath: string): string {
  const safeFilename = sanitizeFilename(targetFilenameOrRelativePath);
  const absoluteBase = path.resolve(baseDir);
  const targetPath = path.resolve(absoluteBase, safeFilename);

  // Security check: ensure target path is strictly within absoluteBase
  if (!targetPath.startsWith(absoluteBase + path.sep) && targetPath !== absoluteBase) {
    throw new Error('Access denied: Potential directory traversal detected.');
  }

  return targetPath;
}
