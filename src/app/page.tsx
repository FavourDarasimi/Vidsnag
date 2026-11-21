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
  Moon,
  Sun,
  Loader2,
  Trash2,
  Save,
  RotateCcw,
  Sparkles,
  Terminal,
  ShieldAlert,
} from 'lucide-react';
import { VideoInfo } from '@/core/types';

interface HistoryItem {
  id: string;
  title: string;
  format: string;
  quality: string;
  filename: string;
  fileSize: number;
  downloadUrl: string;
  thumbnail?: string;
  timestamp: number;
}

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

  // Session history
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Dark mode
  const [isDark, setIsDark] = useState(true);

  // System health
  const [sysHealth, setSysHealth] = useState<{
    healthy: boolean;
    ytDlp: boolean;
    ffmpeg: boolean;
    message?: string;
  } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Initial theme & history setup
  useEffect(() => {
    // Check local storage for theme
    const savedTheme = localStorage.getItem('vidsnag_theme');
    if (savedTheme === 'light') {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    } else {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    }

    // Load session history
    try {
      const savedHistory = sessionStorage.getItem('vidsnag_history');
      if (savedHistory) {
        setHistory(JSON.parse(savedHistory));
      }
    } catch {
      // ignore
    }

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

  const toggleDarkMode = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('vidsnag_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('vidsnag_theme', 'light');
    }
  };

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

              // Add to session history
              const newItem: HistoryItem = {
                id: data.downloadId,
                title: videoInfo?.title || data.filename || 'Downloaded Media',
                format: selectedFormat,
                quality: selectedQuality,
                filename: data.filename,
                fileSize: data.fileSize,
                downloadUrl,
                thumbnail: videoInfo?.thumbnail,
                timestamp: Date.now(),
              };

              setHistory((prev) => {
                const updated = [newItem, ...prev.filter((i) => i.id !== newItem.id)].slice(0, 15);
                try {
                  sessionStorage.setItem('vidsnag_history', JSON.stringify(updated));
                } catch {
                  // ignore
                }
                return updated;
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

  const handleClearHistory = () => {
    setHistory([]);
    try {
      sessionStorage.removeItem('vidsnag_history');
    } catch {
      // ignore
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return 'Unknown size';
    const mb = bytes / (1024 * 1024);
    if (mb < 1) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${mb.toFixed(2)} MB`;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b0f19] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Navigation / Header */}
      <header className="border-b border-slate-200 dark:border-slate-800/80 bg-white/70 dark:bg-[#0f172a]/70 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-black text-xl tracking-wider">
              V
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                vidsnag
              </span>
              <span className="text-xs ml-2 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold border border-indigo-500/20">
                v1.0
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={toggleDarkMode}
              className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* System Health Alert (if degraded) */}
        {sysHealth && !sysHealth.healthy && (
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 flex items-start space-x-3">
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
        <div className="text-center space-y-3 pt-4">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Download Any Video or Audio
          </h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-xl mx-auto text-sm sm:text-base">
            Clean, high-speed downloader powered by <code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-xs font-mono">yt-dlp</code> and <code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-xs font-mono">ffmpeg</code>. Supports YouTube, Vimeo, TikTok, SoundCloud, and 1,000+ sites.
          </p>
        </div>

        {/* Input Bar Card */}
        <section className="bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200 dark:border-slate-800 p-2 sm:p-3 shadow-xl shadow-slate-200/50 dark:shadow-none">
          <form onSubmit={handleFetchInfo} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste video URL here (e.g., https://www.youtube.com/watch?v=...)"
                className="w-full pl-11 pr-4 py-3 bg-transparent rounded-xl text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100 placeholder-slate-400"
                aria-label="Video URL"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isFetchingInfo || !url.trim()}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-500/50 text-white font-medium rounded-xl text-sm sm:text-base flex items-center justify-center space-x-2 transition-all shadow-md shadow-indigo-600/20 disabled:shadow-none"
            >
              {isFetchingInfo ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Fetching...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Fetch Info</span>
                </>
              )}
            </button>
          </form>
        </section>

        {/* Error Message */}
        {infoError && (
          <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300 flex items-start space-x-3 text-sm animate-fadeIn">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-500" />
            <div className="flex-1">
              <p className="font-semibold">Unable to fetch video</p>
              <p className="mt-0.5 text-xs sm:text-sm opacity-90">{infoError}</p>
            </div>
          </div>
        )}

        {/* Video Info Preview & Options Card */}
        {videoInfo && (
          <section className="bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Thumbnail with duration */}
              <div className="md:col-span-5 relative group rounded-xl overflow-hidden bg-slate-950 aspect-video flex items-center justify-center border border-slate-200 dark:border-slate-800">
                {videoInfo.thumbnail ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={videoInfo.thumbnail}
                    alt={videoInfo.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <Film className="w-12 h-12 text-slate-500" />
                )}
                {videoInfo.durationString && (
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/80 backdrop-blur-sm text-white text-xs font-mono font-medium flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{videoInfo.durationString}</span>
                  </div>
                )}
              </div>

              {/* Video Title & Metadata */}
              <div className="md:col-span-7 space-y-4">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white line-clamp-2">
                    {videoInfo.title}
                  </h2>
                  <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                    <User className="w-3.5 h-3.5" />
                    <span>{videoInfo.uploader}</span>
                    <span>•</span>
                    <a
                      href={videoInfo.webpageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1 text-indigo-500 hover:underline"
                    >
                      <span>Original Link</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                {/* Configuration Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {/* Format selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Format
                    </label>
                    <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800/80 p-1 border border-slate-200 dark:border-slate-700/60">
                      <button
                        type="button"
                        onClick={() => setSelectedFormat('mp4')}
                        className={`flex-1 py-1.5 px-3 rounded-md text-xs sm:text-sm font-medium flex items-center justify-center space-x-1.5 transition-all ${
                          selectedFormat === 'mp4'
                            ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
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
                            ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
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
                            ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <Music className="w-3.5 h-3.5" />
                        <span>MP3</span>
                      </button>
                    </div>
                  </div>

                  {/* Quality selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Quality
                    </label>
                    <select
                      value={selectedQuality}
                      onChange={(e) => setSelectedQuality(e.target.value)}
                      disabled={selectedFormat === 'mp3'}
                      className="w-full py-2 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
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
                    className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold rounded-xl text-sm sm:text-base flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-60"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download {selectedFormat.toUpperCase()}</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Live Download Status & Progress (SSE) */}
        {downloadProgress.status !== 'idle' && (
          <section className="bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {downloadProgress.status === 'completed' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : downloadProgress.status === 'error' ? (
                  <AlertCircle className="w-5 h-5 text-rose-500" />
                ) : (
                  <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                )}
                <span className="font-semibold text-sm sm:text-base">
                  {downloadProgress.status === 'starting' && 'Connecting to server...'}
                  {downloadProgress.status === 'downloading' && 'Downloading stream...'}
                  {downloadProgress.status === 'processing' && 'Processing & merging audio/video...'}
                  {downloadProgress.status === 'completed' && 'Download Complete!'}
                  {downloadProgress.status === 'error' && 'Download Failed'}
                </span>
              </div>
              <span className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">
                {Math.round(downloadProgress.percent)}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-200 dark:border-slate-700/50">
              <div
                className={`h-full transition-all duration-300 ease-out ${
                  downloadProgress.status === 'error'
                    ? 'bg-rose-500'
                    : downloadProgress.status === 'completed'
                    ? 'bg-emerald-500'
                    : 'bg-gradient-to-r from-indigo-500 to-violet-500'
                }`}
                style={{ width: `${Math.max(2, Math.min(100, downloadProgress.percent))}%` }}
              />
            </div>

            {/* Progress details: speed, ETA, size */}
            <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-2">
              <div className="flex items-center space-x-3">
                {downloadProgress.speed && (
                  <span>
                    Speed: <strong className="text-slate-700 dark:text-slate-200">{downloadProgress.speed}</strong>
                  </span>
                )}
                {downloadProgress.eta && (
                  <span>
                    ETA: <strong className="text-slate-700 dark:text-slate-200">{downloadProgress.eta}</strong>
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
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs">
                {downloadProgress.error}
              </div>
            )}

            {/* Save file button upon completion */}
            {downloadProgress.status === 'completed' && downloadProgress.downloadUrl && (
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <a
                  href={downloadProgress.downloadUrl}
                  download={downloadProgress.filename}
                  className="w-full sm:w-auto flex-1 py-3 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/20 transition-all"
                >
                  <Save className="w-4 h-4" />
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
                  className="w-full sm:w-auto py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-medium transition-colors flex items-center justify-center space-x-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Start Another</span>
                </button>
              </div>
            )}
          </section>
        )}

        {/* Session Download History */}
        {history.length > 0 && (
          <section className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white flex items-center space-x-2">
                <span>Recent Downloads</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {history.length}
                </span>
              </h3>
              <button
                onClick={handleClearHistory}
                className="text-xs text-slate-500 hover:text-rose-500 flex items-center space-x-1 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear session</span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="bg-white dark:bg-slate-900/80 rounded-xl border border-slate-200 dark:border-slate-800/80 p-3 sm:p-4 flex items-center justify-between gap-3 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center flex-shrink-0">
                      {item.format === 'mp3' ? <Music className="w-4 h-4" /> : <Film className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate">
                        {item.title}
                      </p>
                      <div className="flex items-center space-x-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        <span className="uppercase font-semibold text-indigo-500">{item.format}</span>
                        {item.quality && <span>• {item.quality}</span>}
                        <span>• {formatFileSize(item.fileSize)}</span>
                      </div>
                    </div>
                  </div>

                  <a
                    href={item.downloadUrl}
                    download={item.filename}
                    className="p-2 sm:px-3 sm:py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center space-x-1.5 transition-colors flex-shrink-0"
                    title="Download file"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Save</span>
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CLI Quick Reference Section */}
        <section className="bg-slate-100 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 text-xs text-slate-600 dark:text-slate-400 space-y-2">
          <div className="flex items-center space-x-2 font-semibold text-slate-900 dark:text-slate-200">
            <Terminal className="w-4 h-4 text-indigo-500" />
            <span>Prefer the Terminal? vidsnag CLI</span>
          </div>
          <p>
            You can also run vidsnag directly from your command line:
          </p>
          <div className="bg-slate-900 text-slate-200 font-mono p-3 rounded-lg text-xs overflow-x-auto space-y-1">
            <div><span className="text-emerald-400">$</span> vidsnag &quot;https://www.youtube.com/watch?v=...&quot;</div>
            <div><span className="text-emerald-400">$</span> vidsnag &quot;https://...&quot; --format mp3</div>
            <div><span className="text-emerald-400">$</span> vidsnag info &quot;https://...&quot;</div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800/80 mt-16 py-6 text-center text-xs text-slate-500 dark:text-slate-500">
        <p>
          vidsnag — Open-source media downloader wrapper. Please ensure you have the right to download any content.
        </p>
      </footer>
    </div>
  );
}
