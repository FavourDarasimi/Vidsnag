export type VideoFormatType = 'mp4' | 'webm' | 'mp3' | string;
export type VideoQuality = 'best' | '2160p' | '1440p' | '1080p' | '720p' | '480p' | '360p' | string;

export interface FormatOption {
  formatId: string;
  ext: string;
  resolution?: string;
  qualityLabel?: string;
  height?: number;
  filesize?: number;
  hasVideo: boolean;
  hasAudio: boolean;
  tbr?: number;
}

export interface VideoInfo {
  id: string;
  title: string;
  description?: string;
  duration: number; // in seconds
  durationString: string; // e.g. "03:45"
  thumbnail: string;
  uploader: string;
  url: string;
  webpageUrl: string;
  availableQualities: string[]; // e.g. ["1080p", "720p", "480p", "360p"]
  availableFormats: string[]; // e.g. ["mp4", "webm", "mp3"]
  rawFormats?: FormatOption[];
}

export type DownloadProgressStatus =
  | 'starting'
  | 'downloading'
  | 'processing'
  | 'completed'
  | 'error';

export interface DownloadProgressEvent {
  downloadId: string;
  status: DownloadProgressStatus;
  percent: number; // 0 - 100
  speed: string; // e.g. "5.2MiB/s"
  eta: string; // e.g. "00:15"
  downloadedBytes: number;
  totalBytes: number;
  filename?: string;
  error?: string;
}

export interface DownloadOptions {
  url: string;
  format?: VideoFormatType;
  quality?: VideoQuality;
  outputDir?: string;
  customFilename?: string;
  downloadId?: string;
  onProgress?: (event: DownloadProgressEvent) => void;
}

export interface DownloadResult {
  downloadId: string;
  filePath: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  duration?: number;
  title?: string;
}

export interface DependencyStatus {
  available: boolean;
  path?: string;
  version?: string;
  error?: string;
}

export interface SystemDependencies {
  ytDlp: DependencyStatus;
  ffmpeg: DependencyStatus;
  allSatisfied: boolean;
}
