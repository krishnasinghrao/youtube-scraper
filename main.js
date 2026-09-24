/**
 * Scraper - YouTube Video Downloader
 * A secure Electron application for downloading YouTube videos using yt-dlp
 *
 * @license MIT
 * @author Scraper Contributors
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const https = require("https");
const { URL } = require("url");
const {
  downloadBinary,
  downloadFile,
  extractArchive,
  getExecutableCandidates,
  getThumbnailExtension,
  isNewerVersion,
  isSafeExternalUrl,
  isValidThumbnailUrl,
  isValidYouTubeUrl,
  prepareDependencyDirectory,
  sanitizeFilename,
  toError,
  validateWritableDirectory,
} = require("./lib/core");

/** @type {Electron.BrowserWindow | null} */
let mainWindow = null;
const activeDownloads = new Map();

// Find yt-dlp executable path

let userDependencyPath = null;
let configFilePath = null;

app.on("ready", () => {
  configFilePath = path.join(app.getPath("userData"), "scraper_config.json");
  if (fs.existsSync(configFilePath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configFilePath, "utf8"));
      if (config.userDependencyPath) {
        userDependencyPath = config.userDependencyPath;
      }
    } catch (e) {
      console.error("Failed to load config:", e);
    }
  }
});

function saveConfig(updates) {
  if (!configFilePath) return;
  try {
    let config = {};
    if (fs.existsSync(configFilePath)) {
      try {
        config = JSON.parse(fs.readFileSync(configFilePath, "utf8"));
      } catch {
        /* ignore */
      }
    }
    Object.assign(config, updates);
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("Failed to save config:", error);
  }
}

function getYtDlpExecutableName() {
  return process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
}

function getFfmpegExecutableName() {
  return process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
}

function getYtDlpCandidates() {
  const homeDir = process.env.USERPROFILE || process.env.HOME || "/tmp";
  return getExecutableCandidates(
    getYtDlpExecutableName(),
    [
      "/opt/homebrew/bin/yt-dlp", // Apple Silicon Homebrew
      "/usr/local/bin/yt-dlp", // Intel Homebrew
      "/usr/bin/yt-dlp", // System install
      path.join(homeDir, ".local/bin/yt-dlp"), // User install
    ],
    userDependencyPath,
  );
}

function getFfmpegCandidates() {
  const homeDir = process.env.USERPROFILE || process.env.HOME || "/tmp";
  return getExecutableCandidates(
    getFfmpegExecutableName(),
    [
      "/opt/homebrew/bin/ffmpeg",
      "/usr/local/bin/ffmpeg",
      "/usr/bin/ffmpeg",
      path.join(homeDir, ".local/bin/ffmpeg"),
    ],
    userDependencyPath,
  );
}

/**
 * @param {string} executablePath
 * @param {string[]} args
 * @returns {Promise<{ ok: boolean, stdout: string, stderr: string }>}
 */
function runExecutable(executablePath, args) {
  return new Promise((resolve) => {
    const child = spawn(executablePath, args, {
      timeout: 10000,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim() });
    });

    child.on("error", (error) => {
      resolve({ ok: false, stdout: "", stderr: error.message });
    });
  });
}

/**
 * @param {string[]} candidates
 * @param {string[]} versionArgs
 * @param {boolean} preferNewest
 * @returns {Promise<{ available: boolean, path: string, version: string, candidates: Array<{ path: string, version: string }> }>}
 */
async function resolveExecutable(candidates, versionArgs, preferNewest = false) {
  const availableCandidates = [];

  for (const candidate of candidates) {
    const result = await runExecutable(candidate, versionArgs);
    if (result.ok) {
      availableCandidates.push({
        path: candidate,
        version: result.stdout || result.stderr,
      });
    }
  }

  if (availableCandidates.length === 0) {
    return { available: false, path: "", version: "", candidates: [] };
  }

  const selected = preferNewest
    ? availableCandidates.reduce((best, candidate) =>
        isNewerVersion(candidate.version, best.version) ? candidate : best,
      )
    : availableCandidates[0];

  return {
    available: true,
    path: selected.path,
    version: selected.version,
    candidates: availableCandidates,
  };
}

function resolveYtDlp() {
  return resolveExecutable(getYtDlpCandidates(), ["--version"], true);
}

function resolveFfmpeg() {
  return resolveExecutable(getFfmpegCandidates(), ["-version"], false);
}

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<{ code: number | null, stderr: string }>}
 */
function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stderr = "";

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({ code, stderr });
    });

    child.on("error", reject);
  });
}

// Security: Disable hardware acceleration if needed for compatibility
// app.disableHardwareAcceleration();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, "Logo", "Scraper Logo.PNG"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
      // Security: Disable web security features that could be exploited
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    // Security: Set Content Security Policy
    show: false,
  });

  mainWindow.loadFile("index.html");

  // Show window when ready to prevent visual flash
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Security: Prevent navigation to external sites
  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    try {
      const parsedUrl = new URL(navigationUrl);
      if (parsedUrl.protocol !== "file:") {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  // Security: Prevent opening new windows
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Security: Disable devTools in production
  if (!process.argv.includes("--dev")) {
    mainWindow.webContents.on("devtools-opened", () => {
      mainWindow.webContents.closeDevTools();
    });
  }
}

app.whenReady().then(createWindow);

app.on("before-quit", () => {
  activeDownloads.forEach((childProcess) => {
    if (childProcess && !childProcess.killed) {
      childProcess.kill("SIGTERM");
    }
  });
  activeDownloads.clear();
});

app.on("window-all-closed", () => {
  // Clean up any active downloads
  activeDownloads.forEach((process) => {
    if (process && !process.killed) {
      process.kill("SIGTERM");
    }
  });
  activeDownloads.clear();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Get video info
ipcMain.handle("get-video-info", async (event, url) => {
  // Security: Validate URL
  if (!url || typeof url !== "string") {
    throw new Error("Invalid URL provided");
  }

  if (!isValidYouTubeUrl(url)) {
    throw new Error("Please provide a valid YouTube URL");
  }

  // Check if yt-dlp is available
  const ytdlpInfo = await resolveYtDlp();
  if (!ytdlpInfo.available) {
    throw new Error(
      "yt-dlp is not installed or not found. Install it in the dependency folder or with Homebrew/pip.",
    );
  }

  return new Promise((resolve, reject) => {
    // Security: Use array format to prevent command injection
    const ytdlp = spawn(ytdlpInfo.path, ["-J", "--no-warnings", url], {
      timeout: 30000, // 30 second timeout
    });

    let stdout = "";
    let stderr = "";

    ytdlp.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    ytdlp.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ytdlp.on("close", (code) => {
      if (code === 0) {
        try {
          const data = JSON.parse(stdout);
          // Security: Only return necessary data
          const safeData = {
            title: data.title || "Unknown",
            thumbnail: data.thumbnail || "",
            uploader: data.uploader || data.channel || "Unknown",
            duration: data.duration || 0,
            description: data.description || "",
            tags: data.tags || [],
            view_count: data.view_count || 0,
            like_count: data.like_count || 0,
            upload_date: data.upload_date || "",
            categories: data.categories || [],
            webpage_url: data.webpage_url || "",
            formats: (data.formats || []).map((f) => ({
              format_id: f.format_id,
              format: f.format,
              format_note: f.format_note,
              ext: f.ext,
              resolution: f.resolution,
              fps: f.fps,
              vcodec: f.vcodec,
              acodec: f.acodec,
              filesize: f.filesize,
              filesize_approx: f.filesize_approx,
            })),
          };
          resolve(safeData);
        } catch (e) {
          reject(
            toError(
              {
                error: "Failed to parse video information",
                details: e instanceof Error ? e.message : String(e),
              },
              "Failed to parse video information",
            ),
          );
        }
      } else {
        reject(
          toError(
            {
              error: "Failed to fetch video information",
              details: stderr || "Unknown error",
            },
            "Failed to fetch video information",
          ),
        );
      }
    });

    ytdlp.on("error", (error) => {
      reject(new Error(`Failed to execute yt-dlp: ${error.message}`));
    });
  });
});

// Select download folder
ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
    title: "Select Download Folder",
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];

    // Security: Verify the path exists and is writable
    try {
      await fs.promises.access(selectedPath, fs.constants.W_OK);
      return selectedPath;
    } catch {
      throw new Error("Selected folder is not writable");
    }
  }
  return null;
});

// Download thumbnail
ipcMain.handle(
  "download-thumbnail",
  async (event, { url, title, outputPath }) => {
    if (!url || typeof url !== "string" || !isValidThumbnailUrl(url)) {
      throw new Error("Invalid thumbnail URL provided");
    }

    const extension = getThumbnailExtension(url);
    const safeTitle = sanitizeFilename(
      typeof title === "string" && title ? title : "thumbnail",
    );
    const filename = `${safeTitle || "thumbnail"}-thumbnail.${extension}`;
    let destinationPath = "";

    if (outputPath) {
      if (typeof outputPath !== "string") {
        throw new Error("Invalid output path provided");
      }

      let safePath;
      try {
        safePath = await validateWritableDirectory(outputPath);
      } catch (error) {
        throw toError(error, "Invalid output path");
      }

      destinationPath = path.join(safePath, filename);
    } else {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: "Save Thumbnail",
        defaultPath: path.join(app.getPath("downloads"), filename),
        filters: [
          { name: "Image", extensions: [extension] },
          { name: "All Files", extensions: ["*"] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }

      destinationPath = result.filePath;
    }

    try {
      await downloadFile(url, destinationPath);
      return { success: true, path: destinationPath };
    } catch (error) {
      throw toError(error, "Failed to download thumbnail");
    }
  },
);

// Download video
ipcMain.handle(
  "download-video",
  async (event, { url, formatId, outputPath }) => {
    // Security: Validate inputs
    if (!url || typeof url !== "string" || !isValidYouTubeUrl(url)) {
      throw new Error("Invalid URL provided");
    }

    if (
      !formatId ||
      typeof formatId !== "string" ||
      !/^[a-zA-Z0-9._+/-]+$/.test(formatId)
    ) {
      throw new Error("Invalid format ID provided");
    }

    if (!outputPath || typeof outputPath !== "string") {
      throw new Error("Invalid output path provided");
    }

    // Security: Sanitize and validate output path
    let safePath;
    try {
      safePath = await validateWritableDirectory(outputPath);
    } catch (error) {
      throw toError(error, "Invalid output path");
    }

    const ytdlpInfo = await resolveYtDlp();
    if (!ytdlpInfo.available) {
      throw new Error("yt-dlp is not installed or not found in PATH");
    }

    if (formatId.includes("+")) {
      const ffmpegInfo = await resolveFfmpeg();
      if (!ffmpegInfo.available) {
        throw new Error(
          "This format needs ffmpeg to merge video and audio. Install ffmpeg or choose a Video + Audio format.",
        );
      }
    }

    return new Promise((resolve, reject) => {
      const filename = "%(title)s.%(ext)s";
      const outputTemplate = path.join(safePath, filename);
      let stderr = "";

      // Security: Use array format to prevent command injection
      const args = [
        "-f",
        formatId,
        "-o",
        outputTemplate,
        "--no-playlist",
        "--no-warnings",
        "--newline",
        "--progress",
        url,
      ];

      const ytdlp = spawn(ytdlpInfo.path, args, {
        timeout: 3600000, // 1 hour timeout for large downloads
      });

      // Track active download
      const downloadId = Date.now();
      activeDownloads.set(downloadId, ytdlp);

      ytdlp.stdout.on("data", (data) => {
        const output = data.toString();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("download-progress", output);
        }
      });

      ytdlp.stderr.on("data", (data) => {
        const output = data.toString();
        stderr += output;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("download-progress", output);
        }
      });

      ytdlp.on("close", (code, signal) => {
        activeDownloads.delete(downloadId);

        if (code === 0) {
          resolve({ success: true });
        } else if (signal === "SIGTERM" || signal === "SIGINT") {
          reject(new Error("Download was cancelled."));
        } else {
          const details = stderr.trim();
          reject(
            new Error(
              `Download failed with exit code ${code}${
                details ? `\n${details}` : ""
              }`,
            ),
          );
        }
      });

      ytdlp.on("error", (error) => {
        activeDownloads.delete(downloadId);
        reject(new Error(`Failed to execute yt-dlp: ${error.message}`));
      });
    });
  },
);

// Cancel download
ipcMain.handle("cancel-download", async () => {
  activeDownloads.forEach((process) => {
    if (process && !process.killed) {
      process.kill("SIGTERM");
    }
  });
  activeDownloads.clear();
  return { success: true };
});

// Dependency Management
ipcMain.handle("check-dependencies", async () => {
  const [ytdlpInfo, ffmpegInfo] = await Promise.all([
    resolveYtDlp(),
    resolveFfmpeg(),
  ]);

  let ytdlpOutdated = false;
  let latestVersionInfo = null;
  if (ytdlpInfo.available) {
    try {
      // Fetch latest release tag from GitHub API
      latestVersionInfo = await new Promise((resolve) => {
        const req = https.get(
          "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest",
          {
            headers: { "User-Agent": "Electron-Scraper-App" },
            timeout: 5000, // 5 seconds timeout to prevent hanging
          },
          (res) => {
            if (res.statusCode === 403) {
              // Rate limit
              console.log("GitHub API rate limit hit.");
              resolve(null);
              return;
            }
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              try {
                const parsed = JSON.parse(data);
                resolve(parsed.tag_name);
              } catch {
                resolve(null);
              }
            });
          },
        );
        req.on("error", () => resolve(null));
        req.on("timeout", () => {
          req.destroy();
          resolve(null);
        });
      });

      if (
        latestVersionInfo &&
        ytdlpInfo.version &&
        isNewerVersion(latestVersionInfo, ytdlpInfo.version)
      ) {
        ytdlpOutdated = true;
      }
    } catch (e) {
      console.error("Version check error", e);
    }
  }

  return {
    ytdlp: ytdlpInfo.available,
    ffmpeg: ffmpegInfo.available,
    ytdlpOutdated,
    ytdlpPath: ytdlpInfo.path,
    ffmpegPath: ffmpegInfo.path,
    ytdlpVersion: ytdlpInfo.version,
    latestYtDlpVersion: latestVersionInfo,
    configuredDependencyPath: userDependencyPath,
  };
});

ipcMain.handle("download-dependencies", async (event, location) => {
  const dependencyPath = await prepareDependencyDirectory(location);
  userDependencyPath = dependencyPath;
  saveConfig({ userDependencyPath: dependencyPath });

  const platform = process.platform;
  let ytUrl = "";
  let ytFile = "yt-dlp";
  let ffUrl = "";
  let ffFile = "ffmpeg";
  let archiveName = "";

  if (platform === "win32") {
    ytUrl =
      "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
    ytFile = "yt-dlp.exe";
    ffUrl =
      "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";
    ffFile = "ffmpeg.exe";
    archiveName = "ffmpeg.zip";
  } else if (platform === "darwin") {
    ytUrl =
      "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos";
    ffUrl = "https://evermeet.cx/ffmpeg/getrelease/zip";
    archiveName = "ffmpeg.zip";
  } else {
    ytUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
    ffUrl =
      "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz";
    archiveName = "ffmpeg.tar.xz";
  }

  const ytDest = path.join(dependencyPath, ytFile);
  const archivePath = path.join(dependencyPath, archiveName);

  await downloadBinary(ytUrl, ytDest);
  try {
    fs.chmodSync(ytDest, 0o755);
  } catch {
    /* ignore */
  }

  try {
    await downloadBinary(ffUrl, archivePath);
    await extractArchive(archivePath, dependencyPath, ffFile);
  } finally {
    try {
      if (fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath);
      }
    } catch {
      /* ignore */
    }
  }

  // Ensure execute permissions on extracted binary
  try {
    const ffDest = path.join(dependencyPath, ffFile);
    if (fs.existsSync(ffDest)) fs.chmodSync(ffDest, 0o755);
  } catch {
    /* ignore */
  }

  return {
    success: true,
    message: "Dependencies downloaded to " + dependencyPath,
  };
});

ipcMain.handle("update-dependencies", async () => {
  const ytdlpInfo = await resolveYtDlp();
  if (!ytdlpInfo.available) {
    throw new Error("yt-dlp is not installed or not found");
  }

  const ytdlpPath = ytdlpInfo.path;
  let command = ytdlpPath;
  let args = ["-U"];

  // Smart detection for package managers.
  if (
    ytdlpPath.includes("homebrew") ||
    ytdlpPath.includes("Cellar") ||
    ytdlpPath.includes("/usr/local/bin")
  ) {
    command = "brew";
    args = ["upgrade", "yt-dlp"];
  } else if (
    ytdlpPath.includes(".local/bin") ||
    ytdlpPath.includes("pip") ||
    ytdlpPath.includes("python") ||
    ytdlpPath.includes("site-packages")
  ) {
    command = "pip3";
    args = ["install", "--upgrade", "yt-dlp"];
  }

  try {
    const result = await runCommand(command, args);
    if (result.code === 0) {
      return { success: true };
    }

    const stderr = result.stderr.trim();
    const output = stderr.toLowerCase();

    if (output.includes("brew") && command !== "brew") {
      const fallback = await runCommand("brew", ["upgrade", "yt-dlp"]);
      if (fallback.code === 0) return { success: true };
      throw new Error("Update failed via Homebrew. Please try downloading manually.");
    }

    if (output.includes("pip") && command !== "pip3") {
      const fallback = await runCommand("pip3", ["install", "--upgrade", "yt-dlp"]);
      if (fallback.code === 0) return { success: true };
      throw new Error("Update failed via pip. Please try downloading manually.");
    }

    throw new Error(
      `Update failed (${result.code}). ${
        stderr || "Please try downloading manually."
      }`,
    );
  } catch (error) {
    if (command !== ytdlpPath) {
      const fallback = await runCommand(ytdlpPath, ["-U"]);
      if (fallback.code === 0) return { success: true };
    }

    throw toError(error, "Update failed");
  }
});
