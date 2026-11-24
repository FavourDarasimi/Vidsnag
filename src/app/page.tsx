'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Search,
  Film,
  Music,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  ExternalLink,
  Loader2,
  Save,
  RotateCcw,
  Sparkles,
  Terminal,
  ShieldAlert,
  Copy,
  Check,
} from 'lucide-react';
import { VideoInfo } from '@/core/types';

interface DownloadProgress {
  status: 'idle' | 'starting' | 'downloading' | 'processing' | 'completed' | 'error';
  percent: number;
  speed: string;
  eta: string;
  downloadedBytes: number;
  totalBytes: number;
  filename?: string;
  downloadId?: string;
  downloadUrl?: string;
  error?: string;
}

export default function HomePage() {
  const [url, setUrl] = useState('');
  const [isFetchingInfo, setIsFetchingInfo] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);

  // Download selection states
  const [selectedFormat, setSelectedFormat] = useState('mp4');
  const [selectedQuality, setSelectedQuality] = useState('best');

  // Live download progress
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({
    status: 'idle',
    percent: 0,
    speed: '',
    eta: '',
    downloadedBytes: 0,
    totalBytes: 0,
  });

  // System health
  const [sysHealth, setSysHealth] = useState<{
    healthy: boolean;
    ytDlp: boolean;
    ffmpeg: boolean;
    message?: string;
  } | null>(null);

  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleCopy = (cmd: string, idx: number) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(cmd).catch(() => {});
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1800);
    }
  };

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Check system health
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        setSysHealth({
          healthy: data.status === 'healthy',
          ytDlp: data.dependencies?.ytDlp?.available ?? true,
          ffmpeg: data.dependencies?.ffmpeg?.available ?? true,
        });
      })
      .catch(() => {
        // Non-critical
      });
  }, []);

  const handleFetchInfo = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      setInfoError('Please enter a valid video link.');
      return;
    }

    setIsFetchingInfo(true);
    setInfoError(null);
    setVideoInfo(null);
    setDownloadProgress({
      status: 'idle',
      percent: 0,
      speed: '',
      eta: '',
      downloadedBytes: 0,
      totalBytes: 0,
    });

    try {
      const res = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to retrieve video information.');
      }

      setVideoInfo(data.data);
      if (data.data.availableQualities && data.data.availableQualities.length > 0) {
        setSelectedQuality(data.data.availableQualities[0]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error fetching video metadata.';
      setInfoError(message);
    } finally {
      setIsFetchingInfo(false);
    }
  };

  const handleStartDownload = async () => {
    if (!videoInfo && !url.trim()) return;
    const targetUrl = videoInfo ? videoInfo.url : url.trim();

    setDownloadProgress({
      status: 'starting',
      percent: 0,
      speed: '',
      eta: '',
      downloadedBytes: 0,
      totalBytes: 0,
    });

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          format: selectedFormat,
          quality: selectedQuality,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Download request failed (${response.status})`);
      }

      if (!response.body) {
        throw new Error('ReadableStream not supported by browser.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const rawEvent of events) {
          if (!rawEvent.trim()) continue;

          let eventType = 'message';
          let eventDataRaw = '';

          const lines = rawEvent.split('\n');
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.substring(7).trim();
            } else if (line.startsWith('data: ')) {
              eventDataRaw = line.substring(6).trim();
            }
          }

          if (!eventDataRaw) continue;

          try {
            const data = JSON.parse(eventDataRaw);

            if (eventType === 'progress') {
              setDownloadProgress((prev) => ({
                ...prev,
                status: data.status || 'downloading',
                percent: typeof data.percent === 'number' ? data.percent : prev.percent,
                speed: data.speed || prev.speed,
                eta: data.eta || prev.eta,
                downloadedBytes: data.downloadedBytes || prev.downloadedBytes,
                totalBytes: data.totalBytes || prev.totalBytes,
                downloadId: data.downloadId || prev.downloadId,
              }));
            } else if (eventType === 'complete') {
              const downloadUrl = `/api/files/${data.downloadId}`;
              setDownloadProgress({
                status: 'completed',
                percent: 100,
                speed: '',
                eta: '',
                downloadedBytes: data.fileSize || 0,
                totalBytes: data.fileSize || 0,
                filename: data.filename,
                downloadId: data.downloadId,
                downloadUrl,
              });
            } else if (eventType === 'error') {
              setDownloadProgress((prev) => ({
                ...prev,
                status: 'error',
                error: data.message || 'An error occurred during download.',
              }));
            }
          } catch {
            // ignore JSON parse issue for fragmented chunks
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Download failed.';
      setDownloadProgress((prev) => ({
        ...prev,
        status: 'error',
        error: message,
      }));
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return 'Unknown size';
    const mb = bytes / (1024 * 1024);
    if (mb < 1) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${mb.toFixed(2)} MB`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-black text-neutral-100 selection:bg-orange-500 selection:text-black">
      {/* Navigation / Header */}
      <header className="border-b border-neutral-900 bg-black/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20 text-black font-black text-xl tracking-wider">
              V
            </div>
            <span className="font-extrabold text-xl tracking-tight text-orange-500">
              vidsnag
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 space-y-8">
        {/* System Health Alert (if degraded) */}
        {sysHealth && !sysHealth.healthy && (
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 flex items-start space-x-3">
            <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-500" />
            <div className="text-sm">
              <span className="font-semibold">Tool dependencies missing:</span>{' '}
              {!sysHealth.ytDlp && 'yt-dlp is not found. '}
              {!sysHealth.ffmpeg && 'ffmpeg is not found. '}
              Please ensure yt-dlp and ffmpeg are installed on the host system to allow downloading and media conversion.
            </div>
          </div>
        )}

        {/* Hero Section */}
        <div className="text-center space-y-4 pt-6">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white">
            Download Videos &amp; Audio Instantly
          </h1>
          <p className="text-neutral-300 max-w-xl mx-auto text-base sm:text-lg lg:text-xl">
            Grab any media you love in seconds with a fast, intuitive downloader built for the modern web.
          </p>
        </div>

        {/* Input Bar Card */}
        <section className="bg-neutral-950 rounded-2xl border border-neutral-800 p-2 sm:p-3 shadow-xl shadow-black/40 focus-within:border-orange-500/60 transition-colors">
          <form onSubmit={handleFetchInfo} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste video URL here (e.g., https://www.youtube.com/watch?v=...)"
                className="w-full pl-11 pr-4 py-3 bg-transparent rounded-xl text-sm sm:text-base focus:outline-none text-neutral-100 placeholder-neutral-500"
                aria-label="Video URL"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isFetchingInfo || !url.trim()}
              className="px-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/40 text-black font-bold rounded-xl text-sm sm:text-base flex items-center justify-center space-x-2 transition-all shadow-md shadow-orange-500/20 disabled:shadow-none"
            >
              {isFetchingInfo ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                  <span>Fetching...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-black" />
                  <span>Fetch Info</span>
                </>
              )}
            </button>
          </form>
        </section>

        {/* Video Info Preview & Options Card */}
        {videoInfo && (
          <section className="bg-neutral-950 rounded-2xl border border-neutral-800 p-5 sm:p-6 shadow-xl shadow-black/40 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Thumbnail with duration */}
              <div className="md:col-span-5 relative group rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-neutral-800">
                {videoInfo.thumbnail ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={videoInfo.thumbnail}
                    alt={videoInfo.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <Film className="w-12 h-12 text-neutral-600" />
                )}
                {videoInfo.durationString && (
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/85 backdrop-blur-sm text-orange-400 text-xs font-mono font-medium flex items-center space-x-1 border border-neutral-800">
                    <Clock className="w-3 h-3" />
                    <span>{videoInfo.durationString}</span>
                  </div>
                )}
              </div>

              {/* Video Title & Metadata */}
              <div className="md:col-span-7 space-y-4">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white line-clamp-2">
                    {videoInfo.title}
                  </h2>
                  <div className="flex items-center space-x-2 text-xs text-neutral-400 mt-1.5">
                    <User className="w-3.5 h-3.5 text-orange-500" />
                    <span>{videoInfo.uploader}</span>
                    <span>•</span>
                    <a
                      href={videoInfo.webpageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1 text-orange-400 hover:text-orange-300 hover:underline"
                    >
                      <span>Original Link</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                {/* Configuration Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-neutral-850">
                  {/* Format selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                      Format
                    </label>
                    <div className="flex rounded-lg bg-neutral-900 p-1 border border-neutral-800">
                      <button
                        type="button"
                        onClick={() => setSelectedFormat('mp4')}
                        className={`flex-1 py-1.5 px-3 rounded-md text-xs sm:text-sm font-medium flex items-center justify-center space-x-1.5 transition-all ${
                          selectedFormat === 'mp4'
                            ? 'bg-orange-500 text-black font-bold shadow-sm'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        <Film className="w-3.5 h-3.5" />
                        <span>MP4</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedFormat('webm')}
                        className={`flex-1 py-1.5 px-3 rounded-md text-xs sm:text-sm font-medium flex items-center justify-center space-x-1.5 transition-all ${
                          selectedFormat === 'webm'
                            ? 'bg-orange-500 text-black font-bold shadow-sm'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        <Film className="w-3.5 h-3.5" />
                        <span>WebM</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedFormat('mp3')}
                        className={`flex-1 py-1.5 px-3 rounded-md text-xs sm:text-sm font-medium flex items-center justify-center space-x-1.5 transition-all ${
                          selectedFormat === 'mp3'
                            ? 'bg-orange-500 text-black font-bold shadow-sm'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        <Music className="w-3.5 h-3.5" />
                        <span>MP3</span>
                      </button>
                    </div>
                  </div>

                  {/* Quality selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                      Quality
                    </label>
                    <select
                      value={selectedQuality}
                      onChange={(e) => setSelectedQuality(e.target.value)}
                      disabled={selectedFormat === 'mp3'}
                      className="w-full py-2 px-3 rounded-lg bg-neutral-900 border border-neutral-800 text-xs sm:text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                    >
                      {selectedFormat === 'mp3' ? (
                        <option value="best">Highest Audio Quality (VBR 0)</option>
                      ) : (
                        videoInfo.availableQualities.map((q) => (
                          <option key={q} value={q}>
                            {q === 'best' ? 'Best Available' : q}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                {/* Download CTA */}
                <div className="pt-2">
                  <button
                    onClick={handleStartDownload}
                    disabled={downloadProgress.status === 'starting' || downloadProgress.status === 'downloading' || downloadProgress.status === 'processing'}
                    className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-black font-bold rounded-xl text-sm sm:text-base flex items-center justify-center space-x-2 shadow-lg shadow-orange-500/20 transition-all disabled:opacity-50"
                  >
                    <Download className="w-4 h-4 text-black" />
                    <span>Download {selectedFormat.toUpperCase()}</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Error Message */}
        {infoError && (
          <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 flex items-start space-x-3 text-sm animate-fadeIn">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-500" />
            <div className="flex-1">
              <p className="font-semibold">Unable to fetch video</p>
              <p className="mt-0.5 text-xs sm:text-sm opacity-90">{infoError}</p>
            </div>
          </div>
        )}

        {/* Terminal Component directly under link input */}
        <section className="rounded-2xl border border-neutral-800 bg-[#080808] overflow-hidden shadow-2xl shadow-black/70">
          {/* Terminal Window Title Bar */}
          <div className="bg-neutral-900/95 border-b border-neutral-800/80 px-4 py-2.5 flex items-center justify-between select-none">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] inline-block shadow-sm" />
              <span className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123] inline-block shadow-sm" />
              <span className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] inline-block shadow-sm" />
            </div>
            <div className="flex items-center space-x-2 text-xs text-neutral-400 font-mono">
              <Terminal className="w-3.5 h-3.5 text-orange-500" />
              <span>vidsnag</span>
            </div>
            <div className="w-12 text-right">
              <span className="text-[10px] text-neutral-500 font-mono uppercase tracking-wider">bash</span>
            </div>
          </div>

          {/* Terminal Body */}
          <div className="p-4 sm:p-5 font-mono text-xs sm:text-sm text-neutral-200 space-y-3.5 overflow-x-auto">
            {/* Comment line */}
            <div className="text-neutral-500 text-[11px] sm:text-xs">
              # You can also download directly from your terminal
            </div>

            {/* Command 1 */}
            <div className="flex items-start justify-between group">
              <div className="flex items-baseline space-x-2 flex-wrap">
                <span className="text-emerald-400 font-bold">vidsnag</span>
                <span className="text-neutral-500">:</span>
                <span className="text-blue-400 font-semibold">~</span>
                <span className="text-orange-500 font-bold">$</span>
                <span className="text-neutral-100">
                  <span className="text-orange-400 font-semibold">vidsnag</span> &quot;https://www.youtube.com/watch?v=...&quot;
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('vidsnag "https://www.youtube.com/watch?v=..."', 1)}
                className="opacity-40 group-hover:opacity-100 text-neutral-400 hover:text-orange-400 transition-opacity p-1 ml-2 flex-shrink-0"
                title="Copy command"
              >
                {copiedIdx === 1 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Command 2 */}
            <div className="flex items-start justify-between group">
              <div className="flex items-baseline space-x-2 flex-wrap">
                <span className="text-emerald-400 font-bold">vidsnag</span>
                <span className="text-orange-500 font-bold">$</span>
                <span className="text-neutral-100">
                  <span className="text-orange-400 font-semibold">vidsnag</span> &quot;https://...&quot; <span className="text-yellow-400 font-medium">--format</span> <span className="text-cyan-300">mp3</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('vidsnag "https://..." --format mp3', 2)}
                className="opacity-40 group-hover:opacity-100 text-neutral-400 hover:text-orange-400 transition-opacity p-1 ml-2 flex-shrink-0"
                title="Copy command"
              >
                {copiedIdx === 2 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Command 3 */}
            <div className="flex items-start justify-between group">
              <div className="flex items-baseline space-x-2 flex-wrap">
                <span className="text-emerald-400 font-bold">vidsnag</span>
                <span className="text-orange-500 font-bold">$</span>
                <span className="text-neutral-100">
                  <span className="text-orange-400 font-semibold">vidsnag</span> <span className="text-yellow-400 font-medium">info</span> &quot;https://...&quot;
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('vidsnag info "https://..."', 3)}
                className="opacity-40 group-hover:opacity-100 text-neutral-400 hover:text-orange-400 transition-opacity p-1 ml-2 flex-shrink-0"
                title="Copy command"
              >
                {copiedIdx === 3 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Active prompt with blinking block cursor */}
            <div className="flex items-center space-x-2 pt-1">
              <span className="text-emerald-400 font-bold">vidsnag</span>
              <span className="text-orange-500 font-bold">$</span>
              <span className="w-2.5 h-4 bg-orange-500 animate-pulse inline-block" />
            </div>
          </div>
        </section>

        {/* Live Download Status & Progress (SSE) */}
        {downloadProgress.status !== 'idle' && (
          <section className="bg-neutral-950 rounded-2xl border border-neutral-800 p-5 sm:p-6 shadow-xl shadow-black/40 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {downloadProgress.status === 'completed' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : downloadProgress.status === 'error' ? (
                  <AlertCircle className="w-5 h-5 text-rose-500" />
                ) : (
                  <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
                )}
                <span className="font-semibold text-sm sm:text-base">
                  {downloadProgress.status === 'starting' && 'Connecting to server...'}
                  {downloadProgress.status === 'downloading' && 'Downloading stream...'}
                  {downloadProgress.status === 'processing' && 'Processing & merging audio/video...'}
                  {downloadProgress.status === 'completed' && 'Download Complete!'}
                  {downloadProgress.status === 'error' && 'Download Failed'}
                </span>
              </div>
              <span className="font-mono text-sm font-bold text-orange-400">
                {Math.round(downloadProgress.percent)}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-neutral-900 rounded-full h-3 overflow-hidden border border-neutral-800">
              <div
                className={`h-full transition-all duration-300 ease-out ${
                  downloadProgress.status === 'error'
                    ? 'bg-rose-500'
                    : downloadProgress.status === 'completed'
                    ? 'bg-emerald-500'
                    : 'bg-orange-500'
                }`}
                style={{ width: `${Math.max(2, Math.min(100, downloadProgress.percent))}%` }}
              />
            </div>

            {/* Progress details: speed, ETA, size */}
            <div className="flex flex-wrap items-center justify-between text-xs text-neutral-400 gap-2">
              <div className="flex items-center space-x-3">
                {downloadProgress.speed && (
                  <span>
                    Speed: <strong className="text-neutral-200">{downloadProgress.speed}</strong>
                  </span>
                )}
                {downloadProgress.eta && (
                  <span>
                    ETA: <strong className="text-neutral-200">{downloadProgress.eta}</strong>
                  </span>
                )}
              </div>
              {downloadProgress.downloadedBytes > 0 && (
                <span>
                  {formatFileSize(downloadProgress.downloadedBytes)}
                  {downloadProgress.totalBytes > 0 && ` / ${formatFileSize(downloadProgress.totalBytes)}`}
                </span>
              )}
            </div>

            {/* Error detail */}
            {downloadProgress.status === 'error' && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                {downloadProgress.error}
              </div>
            )}

            {/* Save file button upon completion */}
            {downloadProgress.status === 'completed' && downloadProgress.downloadUrl && (
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <a
                  href={downloadProgress.downloadUrl}
                  download={downloadProgress.filename}
                  className="w-full sm:w-auto flex-1 py-3 px-6 bg-orange-500 hover:bg-orange-600 text-black font-bold rounded-xl text-sm flex items-center justify-center space-x-2 shadow-lg shadow-orange-500/20 transition-all"
                >
                  <Save className="w-4 h-4 text-black" />
                  <span>Save File to Device</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setDownloadProgress({
                      status: 'idle',
                      percent: 0,
                      speed: '',
                      eta: '',
                      downloadedBytes: 0,
                      totalBytes: 0,
                    });
                  }}
                  className="w-full sm:w-auto py-3 px-4 rounded-xl border border-neutral-800 hover:bg-neutral-900 text-neutral-300 text-sm font-medium transition-colors flex items-center justify-center space-x-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Start Another</span>
                </button>
              </div>
            )}
          </section>
        )}

      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-neutral-900 py-6 text-center text-xs text-neutral-500 w-full">
        <p>
          vidsnag — Open-source media downloader wrapper. Please ensure you have the right to download any content.
        </p>
      </footer>
    </div>
  );
}
