import fs from 'fs';
import path from 'path';

/**
 * Automatically cleans up files in the downloads directory older than the specified retention window.
 * Default retention is 1 hour (configured via FILE_RETENTION_HOURS environment variable).
 */
export function cleanupOldDownloads(
  targetDir?: string,
  retentionHours: number = parseFloat(process.env.FILE_RETENTION_HOURS || '1')
): { deletedCount: number; freedBytes: number } {
  const downloadDir = path.resolve(targetDir || process.env.DOWNLOAD_DIR || './downloads');

  if (!fs.existsSync(downloadDir)) {
    return { deletedCount: 0, freedBytes: 0 };
  }

  const maxAgeMs = retentionHours * 60 * 60 * 1000;
  const now = Date.now();
  let deletedCount = 0;
  let freedBytes = 0;

  try {
    const entries = fs.readdirSync(downloadDir);

    for (const entry of entries) {
      // Skip hidden files like .gitkeep or .DS_Store
      if (entry.startsWith('.')) continue;

      const fullPath = path.join(downloadDir, entry);
      try {
        const stats = fs.statSync(fullPath);
        if (stats.isFile()) {
          const ageMs = now - stats.mtimeMs;
          if (ageMs > maxAgeMs) {
            freedBytes += stats.size;
            fs.unlinkSync(fullPath);
            deletedCount++;
          }
        }
      } catch {
        // Ignore file access/deletion conflicts if file is currently open
      }
    }
  } catch {
    // Ignore directory scan errors
  }

  return { deletedCount, freedBytes };
}
