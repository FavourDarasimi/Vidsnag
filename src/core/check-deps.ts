import { spawn } from 'child_process';
import { DependencyStatus, SystemDependencies } from './types';

function runVersionCommand(command: string, args: string[]): Promise<DependencyStatus> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { shell: false });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (err) => {
        resolve({
          available: false,
          error: err.message,
        });
      });

      child.on('close', (code) => {
        if (code === 0) {
          const firstLine = stdout.trim().split('\n')[0] || stderr.trim().split('\n')[0] || '';
          resolve({
            available: true,
            version: firstLine,
          });
        } else {
          resolve({
            available: false,
            error: stderr.trim() || `Exited with code ${code}`,
          });
        }
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      resolve({
        available: false,
        error: message,
      });
    }
  });
}

/**
 * Checks whether yt-dlp and ffmpeg are installed and accessible in the system PATH.
 */
export async function checkSystemDependencies(): Promise<SystemDependencies> {
  const [ytDlp, ffmpeg] = await Promise.all([
    runVersionCommand('yt-dlp', ['--version']),
    runVersionCommand('ffmpeg', ['-version']),
  ]);

  return {
    ytDlp,
    ffmpeg,
    allSatisfied: ytDlp.available && ffmpeg.available,
  };
}

/**
 * Generates clear, helpful installation instructions when dependencies are missing.
 */
export function getDependencyInstallationHelp(missing: { ytDlp?: boolean; ffmpeg?: boolean }): string {
  const lines: string[] = [];

  lines.push('⚠️ Missing required external tools:');
  if (missing.ytDlp) {
    lines.push('  • yt-dlp is required to extract and download media.');
  }
  if (missing.ffmpeg) {
    lines.push('  • ffmpeg is required for merging high-quality video/audio streams and format conversion.');
  }

  lines.push('\nPlease install them for your operating system:');
  lines.push('\n🐧 Linux:');
  if (missing.ytDlp) {
    lines.push('  pip install --user yt-dlp');
    lines.push('  # OR: sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp');
  }
  if (missing.ffmpeg) {
    lines.push('  sudo apt install ffmpeg       # Ubuntu / Debian');
    lines.push('  sudo dnf install ffmpeg       # Fedora / RHEL');
    lines.push('  sudo pacman -S ffmpeg         # Arch Linux');
  }

  lines.push('\n🍏 macOS (Homebrew):');
  const brewPkgs = [missing.ytDlp ? 'yt-dlp' : '', missing.ffmpeg ? 'ffmpeg' : ''].filter(Boolean).join(' ');
  lines.push(`  brew install ${brewPkgs}`);

  lines.push('\n🪟 Windows (winget):');
  if (missing.ytDlp) lines.push('  winget install yt-dlp');
  if (missing.ffmpeg) lines.push('  winget install Gyan.FFmpeg');

  return lines.join('\n');
}

/**
 * Asserts that dependencies are available, throwing a descriptive error if not.
 */
export async function assertDependencies(requireFfmpeg = true): Promise<SystemDependencies> {
  const deps = await checkSystemDependencies();
  const missingYtDlp = !deps.ytDlp.available;
  const missingFfmpeg = requireFfmpeg && !deps.ffmpeg.available;

  if (missingYtDlp || missingFfmpeg) {
    const help = getDependencyInstallationHelp({ ytDlp: missingYtDlp, ffmpeg: missingFfmpeg });
    throw new Error(help);
  }

  return deps;
}
