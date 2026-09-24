// Type definitions for the Electron app

interface VideoFormat {
  format_id: string;
  format?: string;
  format_note?: string;
  ext?: string;
  resolution?: string;
  fps?: number;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  filesize_approx?: number;
}

interface VideoInfo {
  title: string;
  thumbnail: string;
  uploader: string;
  duration: number;
  description: string;
  tags: string[];
  view_count: number;
  like_count: number;
  upload_date: string;
  categories: string[];
  webpage_url: string;
  formats: VideoFormat[];
}

interface DependencyStatus {
  ytdlp: boolean;
  ffmpeg: boolean;
  ytdlpOutdated: boolean;
  ytdlpPath?: string;
  ffmpegPath?: string;
  ytdlpVersion?: string;
  latestYtDlpVersion?: string | null;
  configuredDependencyPath?: string | null;
}

interface ElectronAPI {
  getVideoInfo: (url: string) => Promise<VideoInfo>;
  selectFolder: () => Promise<string | null>;
  downloadThumbnail: (data: {
    url: string;
    title: string;
    outputPath?: string | null;
  }) => Promise<{ success: boolean; canceled?: boolean; path?: string }>;
  downloadVideo: (data: {
    url: string;
    formatId: string;
    outputPath: string;
  }) => Promise<{ success: boolean }>;
  cancelDownload: () => Promise<{ success: boolean }>;
  checkDependencies: () => Promise<DependencyStatus>;
  downloadDependencies: (location: string) => Promise<{
    success: boolean;
    message: string;
  }>;
  updateDependencies: () => Promise<{ success: boolean }>;

  onDownloadProgress: (callback: (data: string) => void) => () => void;
}

interface Window {
  electronAPI: ElectronAPI;
}

