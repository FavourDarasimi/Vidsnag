# vidsnag

**vidsnag** is a media downloader offering both an interactive command-line interface (CLI) and a web application built with TypeScript and Next.js (App Router). It acts as a wrapper around [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) and [`ffmpeg`](https://ffmpeg.org/), sharing a single core download module across both interfaces.

---

## Architecture: Shared Core Module

Both the CLI (`src/cli/index.ts`) and the Next.js API routes (`src/app/api/`) import their business logic directly from `src/core/`. This architecture guarantees a **single source of truth** for:

```
vidsnag/
├── src/
│   ├── core/                    # Shared core logic (CLI & Web UI)
│   │   ├── types.ts             # Video metadata & progress event schemas
│   │   ├── validate.ts          # Zod validation & path traversal defenses
│   │   ├── check-deps.ts        # System dependency detector (yt-dlp & ffmpeg)
│   │   ├── info.ts              # Metadata scraper (`yt-dlp --dump-json`)
│   │   ├── downloader.ts        # Streaming process spawner with progress hooks
│   │   ├── concurrency.ts       # Queue manager for limiting concurrent tasks
│   │   ├── rate-limit.ts        # Sliding-window in-memory IP rate limiter
│   │   ├── cleanup.ts           # Automatic file retention garbage collection
│   │   └── index.ts             # Unified barrel export
│   ├── cli/
│   │   └── index.ts             # CLI entry point (Commander.js + cli-progress)
│   └── app/                     # Next.js 14 App Router
│       ├── page.tsx             # Interactive web UI (Dark mode, SSE progress)
│       ├── api/info/route.ts    # POST: URL -> Video metadata
│       ├── api/download/route.ts# POST: Server-Sent Events (SSE) download stream
│       ├── api/files/[id]/route.ts # GET: Safe file delivery with traversal protection
│       └── api/health/route.ts  # GET: Environment & dependency status check
├── downloads/                   # Default output directory (gitignored)
├── Dockerfile                   # Docker container with yt-dlp, ffmpeg & Node.js
└── package.json
```

---

## Prerequisites

Before running `vidsnag`, ensure the following tools are installed on your system:

1. **Node.js**: v18.17.0+ or v20+
2. **yt-dlp**: Required for media extraction and downloading.
   - **Linux**: `pip install --user yt-dlp` or `sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp`
   - **macOS**: `brew install yt-dlp`
   - **Windows**: `winget install yt-dlp`
3. **ffmpeg**: Required for audio extraction (`mp3`) and video stream merging (`mp4`, `webm`).
   - **Linux (Ubuntu/Debian)**: `sudo apt install ffmpeg`
   - **Linux (Fedora/RHEL)**: `sudo dnf install ffmpeg`
   - **macOS**: `brew install ffmpeg`
   - **Windows**: `winget install Gyan.FFmpeg`

---

## Installation & Setup

1. **Clone and install dependencies**:
   ```bash
   git clone <repo-url> vidsnag
   cd vidsnag
   npm install
   ```

2. **Environment Variables**:
   Copy the example `.env.example` file:
   ```bash
   cp .env.example .env
   ```
   Variables available:
   - `DOWNLOAD_DIR`: Path where media files are saved (default: `./downloads`).
   - `PORT`: HTTP port for web interface (default: `3000`).
   - `MAX_CONCURRENT`: Maximum simultaneous active downloads (default: `2`).
   - `FILE_RETENTION_HOURS`: Hours before downloaded files are automatically purged (default: `1`).
   - `RATE_LIMIT_PER_MINUTE`: Allowed API calls per IP per minute (default: `60`).

3. **Build both Web UI and CLI**:
   ```bash
   npm run build
   ```

4. **Globally link the CLI**:
   To use the `vidsnag` command anywhere on your terminal:
   ```bash
   npm link
   ```
   *(Or run locally using `npm run cli -- <args>`)*.

---

## CLI Usage

### 1. Download with sensible defaults (best quality MP4)
```bash
vidsnag "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

### 2. Audio-only (MP3)
```bash
vidsnag "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --format mp3
```

### 3. Specify video quality (e.g. 720p, 1080p)
```bash
vidsnag "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --quality 720p
```

### 4. Custom output folder and filename
```bash
vidsnag "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --output ./my-videos --filename "song.mp4"
```

### 5. Inspect video information without downloading
```bash
vidsnag info "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```
Prints title, uploader, duration, thumbnail URL, and all available format resolutions.

### 6. Start the Web Interface
```bash
vidsnag serve
# Or specify a custom port:
vidsnag serve --port 8080
```

### CLI Features:
- Real-time terminal progress bar (percentage, download speed, ETA, processing stage).
- Automatic verification of `yt-dlp` and `ffmpeg` with clear operating system installation instructions if missing.
- Safe non-zero exit codes upon failures.
- Built-in `--help` for all commands.

---

## Web UI Usage

1. Start development server:
   ```bash
   npm run dev
   ```
   Or production server:
   ```bash
   npm start
   ```
2. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Web Features:
- **Single Page App**: Clean, responsive layout with Tailwind CSS.
- **Dark Mode**: Seamless toggle between dark and light themes with persistence.
- **Video Metadata Preview**: Displays high-resolution thumbnail, duration badge, title, author, and direct link.
- **Format & Quality Selectors**: Choose between MP4, WebM, and MP3 formats, and select from detected resolutions (e.g. 1080p, 720p, 480p).
- **Server-Sent Events (SSE)**: Streams real-time progress from `yt-dlp` to an animated UI progress bar with live download speed, ETA, and status indicators.
- **Session History**: Maintains a history of completed downloads in the session with direct download links.
- **Accessible & Responsive**: Keyboard navigable, accessible form labels, mobile-friendly.

---

## Security & Reliability Highlights

1. **No Shell Injection**:
   All child processes are spawned directly via `child_process.spawn(cmd, args, { shell: false })` using an array of arguments. Commands are never passed through a shell interpreter or constructed via string concatenation.
2. **URL Sanitization & Validation**:
   Strict `zod` schema ensures only valid `http:` and `https:` URLs are accepted, preventing arbitrary protocol manipulation.
3. **Directory Traversal Protection**:
   The file serving route (`/api/files/[id]`) validates IDs and enforces canonical path boundary checking (`resolveSafePath`). Attempting to request files with `../` or arbitrary system paths is blocked.
4. **Rate Limiting**:
   In-memory sliding-window limiter guards all API endpoints against abuse and denial of service.
5. **Concurrency Management**:
   Configurable queue (`MAX_CONCURRENT`) prevents memory and CPU exhaustion by limiting concurrent `yt-dlp` download processes.
6. **Automatic Cleanup**:
   Background garbage collection removes files older than the retention period (default: 1 hour) to preserve disk space.

---

## Docker Deployment

Build and run with Docker:

```bash
# Build the Docker image
docker build -t vidsnag .

# Run the container
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/downloads:/app/downloads \
  --name vidsnag-app \
  vidsnag
```

Open [http://localhost:3000](http://localhost:3000) to use the web application.

---

## Legal & Ethical Disclaimer

**vidsnag** is intended solely for downloading content you own, open-access public domain media, or media for which you have explicit permission from the copyright owner. The developers and contributors do not endorse or encourage unauthorized downloading or distribution of copyrighted material. Users are solely responsible for ensuring compliance with applicable copyright laws and terms of service.
# Vidsnag
