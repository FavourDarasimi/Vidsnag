#!/usr/bin/env node

import { Command } from 'commander';
import pc from 'picocolors';
import cliProgress from 'cli-progress';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import {
  getVideoInfo,
  downloadVideo,
  checkSystemDependencies,
  getDependencyInstallationHelp,
  cleanupOldDownloads,
} from '../core';

const program = new Command();

program
  .name('vidsnag')
  .description('Fast, safe video and audio downloader powered by yt-dlp and ffmpeg')
  .version('1.0.0');

// Dependency verification helper
async function verifyDependencies(requireFfmpeg = true): Promise<boolean> {
  const deps = await checkSystemDependencies();
  const missingYtDlp = !deps.ytDlp.available;
  const missingFfmpeg = requireFfmpeg && !deps.ffmpeg.available;

  if (missingYtDlp || missingFfmpeg) {
    console.error(pc.red('\n[vidsnag] Environment Error:'));
    console.error(getDependencyInstallationHelp({ ytDlp: missingYtDlp, ffmpeg: missingFfmpeg }));
    return false;
  }
  return true;
}

// 1. Download command (default command when url is passed)
program
  .argument('[url]', 'Video URL to download')
  .option('-f, --format <format>', 'Media format: mp4, webm, mp3', 'mp4')
  .option('-q, --quality <quality>', 'Video quality: best, 1080p, 720p, 480p, 360p', 'best')
  .option('-o, --output <dir>', 'Output directory', './downloads')
  .option('--filename <filename>', 'Custom filename for saved file')
  .action(async (url, options) => {
    if (!url) {
      program.help();
      return;
    }

    const ready = await verifyDependencies(true);
    if (!ready) {
      process.exit(1);
    }

    console.log(pc.cyan(`\n⚡ vidsnag: Initializing download`));
    console.log(pc.dim(`   URL:     ${url}`));
    console.log(pc.dim(`   Format:  ${options.format}`));
    console.log(pc.dim(`   Quality: ${options.quality}`));
    console.log(pc.dim(`   Output:  ${options.output}\n`));

    const progressBar = new cliProgress.SingleBar(
      {
        format: `${pc.cyan('Downloading')} [${pc.green('{bar}')}] ${pc.bold('{percentage}%')} | Speed: {speed} | ETA: {eta} | {statusText}`,
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
      },
      cliProgress.Presets.shades_classic
    );

    try {
      // Periodic cleanup of stale downloads in target directory
      cleanupOldDownloads(options.output);

      progressBar.start(100, 0, {
        speed: '0 KiB/s',
        eta: '--:--',
        statusText: 'Connecting...',
      });

      const result = await downloadVideo({
        url,
        format: options.format,
        quality: options.quality,
        outputDir: options.output,
        customFilename: options.filename,
        onProgress: (event) => {
          let statusText = 'Downloading';
          if (event.status === 'processing') {
            statusText = pc.yellow('Processing / Merging...');
          } else if (event.status === 'completed') {
            statusText = pc.green('Done');
          }

          progressBar.update(Math.floor(event.percent), {
            speed: event.speed || '...',
            eta: event.eta || '--:--',
            statusText,
          });
        },
      });

      progressBar.update(100, {
        speed: '-',
        eta: '00:00',
        statusText: pc.green('Completed!'),
      });
      progressBar.stop();

      const sizeMb = (result.fileSize / (1024 * 1024)).toFixed(2);
      console.log(`\n${pc.green('✔')} ${pc.bold('Download successful!')}`);
      console.log(`  File: ${pc.cyan(result.filePath)}`);
      console.log(`  Size: ${pc.dim(`${sizeMb} MB`)}\n`);
    } catch (err: unknown) {
      progressBar.stop();
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\n${pc.red('✖ Error:')} ${message}\n`);
      process.exit(1);
    }
  });

// 2. Info command
program
  .command('info <url>')
  .description('Inspect video metadata and available formats/qualities without downloading')
  .action(async (url: string) => {
    const ready = await verifyDependencies(false);
    if (!ready) {
      process.exit(1);
    }

    console.log(pc.cyan(`\n🔍 Fetching media info for:`));
    console.log(pc.dim(`   ${url}\n`));

    try {
      const info = await getVideoInfo(url);
      console.log(pc.bold(pc.green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')));
      console.log(`${pc.bold('Title:')}       ${info.title}`);
      console.log(`${pc.bold('Creator:')}     ${info.uploader}`);
      console.log(`${pc.bold('Duration:')}    ${info.durationString} (${info.duration}s)`);
      console.log(`${pc.bold('Video ID:')}    ${info.id}`);
      if (info.thumbnail) {
        console.log(`${pc.bold('Thumbnail:')}   ${pc.underline(info.thumbnail)}`);
      }
      console.log(`${pc.bold('Qualities:')}   ${info.availableQualities.join(', ')}`);
      console.log(`${pc.bold('Formats:')}     ${info.availableFormats.join(', ')}`);
      console.log(pc.bold(pc.green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${pc.red('✖ Error:')} ${message}\n`);
      process.exit(1);
    }
  });

// 3. Serve command
program
  .command('serve')
  .description('Launch the Next.js web interface')
  .option('-p, --port <port>', 'Port number to listen on', process.env.PORT || '3000')
  .action((options) => {
    const port = options.port || '3000';
    console.log(pc.cyan(`\n🌐 Launching vidsnag web interface on port ${port}...`));

    // Locate project root
    const projectRoot = path.resolve(__dirname, '..', '..');
    const isBuilt = fs.existsSync(path.join(projectRoot, '.next'));

    const cmd = 'npx';
    const args = isBuilt
      ? ['next', 'start', '-p', port]
      : ['next', 'dev', '-p', port];

    if (!isBuilt) {
      console.log(pc.yellow('   Note: Production build not detected. Starting in development mode.'));
    }

    console.log(pc.green(`   URL: http://localhost:${port}\n`));

    const server = spawn(cmd, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        PORT: port,
      },
    });

    server.on('error', (err) => {
      console.error(pc.red(`\n✖ Failed to start server: ${err.message}`));
      process.exit(1);
    });

    server.on('close', (code) => {
      if (code !== 0 && code !== null) {
        process.exit(code);
      }
    });
  });

program.parse(process.argv);
