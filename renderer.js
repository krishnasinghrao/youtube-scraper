/**
 * Renderer Process - UI Logic
 * Handles user interactions and displays video information
 *
 * @license MIT
 */

// Application state
/** @type {string | null} */
let currentVideoUrl = null;
/** @type {string | null} */
let currentThumbnailUrl = null;
let currentVideoTitle = "thumbnail";
/** @type {string | null} */
let selectedFormat = null;
/** @type {string | null} */
let selectedOutputPath = null;
let isDownloading = false;
/** @type {Function | null} */
let progressCleanup = null;
let dependencyLocation = null;

// Modal Elements
const dependencyModal = document.getElementById("dependencyModal");
const dependencyTitle = document.getElementById("dependencyTitle");
const dependencyMessage = document.getElementById("dependencyMessage");
const ytdlpState = document.getElementById("ytdlpState");
const ffmpegState = document.getElementById("ffmpegState");
const dependencyFolderSection = document.getElementById(
  "dependencyFolderSection",
);
/** @type {HTMLInputElement} */
const dependencyPathInput = /** @type {HTMLInputElement} */ (
  document.getElementById("dependencyPathInput")
);
/** @type {HTMLButtonElement} */
const dependencyBrowseBtn = /** @type {HTMLButtonElement} */ (
  document.getElementById("dependencyBrowseBtn")
);
/** @type {HTMLButtonElement} */
const dependencyActionBtn = /** @type {HTMLButtonElement} */ (
  document.getElementById("dependencyActionBtn")
);
const dependencyProgress = document.getElementById("dependencyProgress");
const dependencyProgressText = document.getElementById(
  "dependencyProgressText",
);

/** @type {HTMLInputElement} */
const urlInput = /** @type {HTMLInputElement} */ (
  document.getElementById("urlInput")
);
/** @type {HTMLButtonElement} */
const fetchBtn = /** @type {HTMLButtonElement} */ (
  document.getElementById("fetchBtn")
);
/** @type {HTMLInputElement} */
const headerUrlInput = /** @type {HTMLInputElement} */ (
  document.getElementById("headerUrlInput")
);
/** @type {HTMLButtonElement} */
const headerFetchBtn = /** @type {HTMLButtonElement} */ (
  document.getElementById("headerFetchBtn")
);
/** @type {HTMLElement} */
const loading = /** @type {HTMLElement} */ (document.getElementById("loading"));
/** @type {HTMLElement} */
const videoInfo = /** @type {HTMLElement} */ (
  document.getElementById("videoInfo")
);
/** @type {HTMLElement} */
const error = /** @type {HTMLElement} */ (document.getElementById("error"));
/** @type {HTMLElement} */
const formatsList = /** @type {HTMLElement} */ (
  document.getElementById("formatsList")
);
/** @type {HTMLButtonElement} */
const selectFolderBtn = /** @type {HTMLButtonElement} */ (
  document.getElementById("selectFolderBtn")
);
/** @type {HTMLInputElement} */
const outputPath = /** @type {HTMLInputElement} */ (
  document.getElementById("outputPath")
);
/** @type {HTMLButtonElement} */
const downloadBtn = /** @type {HTMLButtonElement} */ (
  document.getElementById("downloadBtn")
);
/** @type {HTMLButtonElement} */
const cancelBtn = /** @type {HTMLButtonElement} */ (
  document.getElementById("cancelBtn")
);
/** @type {HTMLElement} */
const downloadProgress = /** @type {HTMLElement} */ (
  document.getElementById("downloadProgress")
);
/** @type {HTMLElement} */
const progressOutput = /** @type {HTMLElement} */ (
  document.getElementById("progressOutput")
);
/** @type {HTMLButtonElement} */
const downloadThumbnailBtn = /** @type {HTMLButtonElement} */ (
  document.getElementById("downloadThumbnailBtn")
);

// Security: Input sanitization
/**
 * @param {any} input
 * @returns {string}
 */
function sanitizeInput(input) {
  if (typeof input !== "string") return "";
  return input.trim().substring(0, 2000);
}

/**
 * @param {unknown} err
 * @param {string} fallback
 * @returns {string}
 */
function getErrorMessage(err, fallback) {
  if (err && typeof err === "object") {
    if ("error" in err && typeof err.error === "string") {
      return err.error;
    }
    if ("message" in err && typeof err.message === "string") {
      return err.message;
    }
  }

  return fallback;
}

// Fetch video info function
/**
 * @param {string} url
 * @param {boolean} fromHeader
 */
async function fetchVideoInfo(url, fromHeader = false) {
  const sanitizedUrl = sanitizeInput(url);

  if (!sanitizedUrl) {
    showError("Please enter a YouTube URL");
    return;
  }

  // Basic URL validation
  try {
    new URL(sanitizedUrl);
  } catch {
    showError("Please enter a valid URL");
    return;
  }

  // Switch to main app view if coming from home
  if (!fromHeader) {
    document.getElementById("homeScreen").classList.add("hidden");
    document.getElementById("mainApp").classList.remove("hidden");
    // Sync the URL to header input
    headerUrlInput.value = sanitizedUrl;
  }

  hideError();
  hideVideoInfo();
  currentVideoUrl = null;
  currentThumbnailUrl = null;
  currentVideoTitle = "thumbnail";
  resetSelectedFormat();
  showLoading();
  fetchBtn.disabled = true;
  headerFetchBtn.disabled = true;

  try {
    const data = await window.electronAPI.getVideoInfo(sanitizedUrl);
    currentVideoUrl = sanitizedUrl;
    displayVideoInfo(data);
    hideLoading();
  } catch (err) {
    hideLoading();
    showError(
      getErrorMessage(
        err,
        "Failed to fetch video information. Make sure yt-dlp is installed.",
      ),
    );
  } finally {
    fetchBtn.disabled = false;
    headerFetchBtn.disabled = false;
  }
}

// Home screen fetch button
fetchBtn.addEventListener("click", () => {
  fetchVideoInfo(urlInput.value, false);
});

// Header fetch button
headerFetchBtn.addEventListener("click", () => {
  fetchVideoInfo(headerUrlInput.value, true);
});

// Allow Enter key to fetch video info
urlInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !fetchBtn.disabled) {
    fetchBtn.click();
  }
});

// Allow Enter key in header search
headerUrlInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !headerFetchBtn.disabled) {
    headerFetchBtn.click();
  }
});

// Click logo to go back home
const headerLogo = document.querySelector("header h1");
if (headerLogo) {
  headerLogo.addEventListener("click", goBackToHome);
}

// Display video information
/**
 * @param {VideoInfo} data
 */
function displayVideoInfo(data) {
  // Security: Sanitize all displayed data
  /** @type {HTMLImageElement} */
  const thumbnail = /** @type {HTMLImageElement} */ (
    document.getElementById("thumbnail")
  );
  /** @type {HTMLElement} */
  const title = /** @type {HTMLElement} */ (document.getElementById("title"));
  /** @type {HTMLElement} */
  const channel = /** @type {HTMLElement} */ (
    document.getElementById("channel")
  );
  /** @type {HTMLElement} */
  const duration = /** @type {HTMLElement} */ (
    document.getElementById("duration")
  );
  /** @type {HTMLElement} */
  const views = /** @type {HTMLElement} */ (document.getElementById("views"));
  /** @type {HTMLElement} */
  const likes = /** @type {HTMLElement} */ (document.getElementById("likes"));
  /** @type {HTMLElement} */
  const uploadDate = /** @type {HTMLElement} */ (
    document.getElementById("uploadDate")
  );
  /** @type {HTMLElement} */
  const description = /** @type {HTMLElement} */ (
    document.getElementById("description")
  );
  /** @type {HTMLElement} */
  const tags = /** @type {HTMLElement} */ (document.getElementById("tags"));

  // Validate thumbnail URL
  currentThumbnailUrl = null;
  try {
    const thumbUrl = new URL(data.thumbnail);
    if (thumbUrl.protocol === "https:" || thumbUrl.protocol === "http:") {
      thumbnail.src = data.thumbnail;
      currentThumbnailUrl = data.thumbnail;
    }
  } catch {
    thumbnail.src = "";
  }

  currentVideoTitle = data.title || "thumbnail";
  downloadThumbnailBtn.disabled = !currentThumbnailUrl;

  title.textContent = data.title || "Unknown Title";
  channel.textContent = data.uploader || "Unknown Channel";
  duration.textContent = formatDuration(data.duration);
  views.textContent = formatViews(data.view_count);

  // Handle likes
  if (data.like_count && data.like_count > 0) {
    likes.textContent = formatNumber(data.like_count) + " likes";
    document.getElementById("likesSeparator").style.display = "inline";
  } else {
    likes.textContent = "";
    document.getElementById("likesSeparator").style.display = "none";
  }

  // Handle upload date
  if (data.upload_date) {
    uploadDate.textContent = formatUploadDate(data.upload_date);
    document.getElementById("dateSeparator").style.display = "inline";
  } else {
    uploadDate.textContent = "";
    document.getElementById("dateSeparator").style.display = "none";
  }

  // Handle description
  if (data.description && data.description.trim()) {
    description.textContent = data.description;
    document.getElementById("descriptionSection").style.display = "block";
  } else {
    document.getElementById("descriptionSection").style.display = "none";
  }

  // Handle tags
  if (Array.isArray(data.tags) && data.tags.length > 0) {
    tags.replaceChildren();
    data.tags.forEach((tag) => {
      const tagElement = document.createElement("span");
      tagElement.className = "tag";
      tagElement.textContent = tag;
      tags.appendChild(tagElement);
    });
    document.getElementById("tagsSection").style.display = "block";
  } else {
    document.getElementById("tagsSection").style.display = "none";
  }

  displayFormats(data.formats || []);
  videoInfo.classList.remove("hidden");
}

// Toggle description
document
  .getElementById("descriptionToggle")
  .addEventListener("click", function () {
    /** @type {HTMLElement} */
    const description = /** @type {HTMLElement} */ (
      document.getElementById("description")
    );
    const toggle = /** @type {HTMLElement} */ (this);
    const isHidden = description.classList.contains("hidden");

    if (isHidden) {
      description.classList.remove("hidden");
      toggle.querySelector("span").textContent = "Hide Description";
      toggle.classList.add("expanded");
    } else {
      description.classList.add("hidden");
      toggle.querySelector("span").textContent = "Show Description";
      toggle.classList.remove("expanded");
    }
  });

// Display available formats
/**
 * @param {VideoFormat[]} formats
 */
function displayFormats(formats) {
  formatsList.replaceChildren();
  resetSelectedFormat();

  // Filter and sort formats
  const combinedVideoFormats = formats.filter(
    (f) => f.vcodec !== "none" && f.acodec !== "none",
  );
  const videoOnlyFormats = formats.filter(
    (f) => f.vcodec !== "none" && f.acodec === "none",
  );
  const audioFormats = formats.filter(
    (f) => f.vcodec === "none" && f.acodec !== "none",
  );

  if (combinedVideoFormats.length > 0) {
    addFormatSection("Video + Audio", combinedVideoFormats);
  }

  if (videoOnlyFormats.length > 0) {
    addFormatSection("Video Only + Best Audio", videoOnlyFormats);
  }

  if (audioFormats.length > 0) {
    addFormatSection("Audio Only", audioFormats);
  }

  if (
    combinedVideoFormats.length === 0 &&
    videoOnlyFormats.length === 0 &&
    audioFormats.length === 0
  ) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent = "No downloadable formats were found.";
    formatsList.appendChild(emptyState);
  }
}

/**
 * @param {string} title
 * @param {VideoFormat[]} formats
 */
function addFormatSection(title, formats) {
  const section = document.createElement("div");
  section.className = "format-section-header";
  section.textContent = title;
  formatsList.appendChild(section);

  formats.forEach((format) => {
    const item = document.createElement("div");
    item.className = "format-item";
    item.dataset.formatId = format.format_id;

    const info = document.createElement("div");
    info.className = "format-info";

    const type = document.createElement("div");
    type.className = "format-type";
    type.textContent = format.format_note || format.format || "Standard";

    const details = document.createElement("div");
    details.className = "format-details";
    const resolution = format.resolution || "audio";
    const ext = format.ext || "unknown";
    const fps = format.fps ? ` ${format.fps}fps` : "";
    details.textContent = `${resolution} - ${ext}${fps}`;

    info.appendChild(type);
    info.appendChild(details);

    const size = document.createElement("div");
    size.className = "format-size";
    size.textContent = format.filesize
      ? formatBytes(format.filesize)
      : format.filesize_approx
        ? `~${formatBytes(format.filesize_approx)}`
        : "Size unknown";

    item.appendChild(info);
    item.appendChild(size);

    item.addEventListener("click", () => selectFormat(item, format));

    formatsList.appendChild(item);
  });
}

// Select format
/**
 * @param {HTMLElement} element
 * @param {VideoFormat} format
 */
function selectFormat(element, format) {
  document.querySelectorAll(".format-item").forEach((item) => {
    item.classList.remove("selected");
  });

  element.classList.add("selected");
  selectedFormat =
    format.vcodec !== "none" && format.acodec === "none"
      ? `${format.format_id}+bestaudio/best`
      : format.format_id;
  updateDownloadButton();
}

function resetSelectedFormat() {
  selectedFormat = null;
  document.querySelectorAll(".format-item").forEach((item) => {
    item.classList.remove("selected");
  });
  updateDownloadButton();
}

downloadThumbnailBtn.addEventListener("click", async () => {
  if (!currentThumbnailUrl || downloadThumbnailBtn.disabled) return;

  downloadThumbnailBtn.disabled = true;
  hideError();

  try {
    const result = await window.electronAPI.downloadThumbnail({
      url: currentThumbnailUrl,
      title: currentVideoTitle,
      outputPath: selectedOutputPath,
    });

    if (result && result.canceled) {
      return;
    }
  } catch (err) {
    showError(getErrorMessage(err, "Failed to download thumbnail."));
  } finally {
    downloadThumbnailBtn.disabled = !currentThumbnailUrl;
  }
});

// Select output folder
selectFolderBtn.addEventListener("click", async () => {
  try {
    const folder = await window.electronAPI.selectFolder();
    if (folder) {
      selectedOutputPath = folder;
      outputPath.value = folder;
      updateDownloadButton();
    }
  } catch (err) {
    showError(getErrorMessage(err, "Unable to select that folder."));
  }
});

// Update download button state
function updateDownloadButton() {
  downloadBtn.disabled = !(selectedFormat && selectedOutputPath);
}

// Download video
downloadBtn.addEventListener("click", async () => {
  if (
    !currentVideoUrl ||
    !selectedFormat ||
    !selectedOutputPath ||
    isDownloading
  ) {
    return;
  }

  isDownloading = true;
  downloadBtn.disabled = true;
  cancelBtn.classList.remove("hidden");
  downloadProgress.classList.remove("hidden");
  progressOutput.textContent = "Starting download...\n";

  // Setup progress listener
  progressCleanup = window.electronAPI.onDownloadProgress((data) => {
    progressOutput.textContent += data;
    progressOutput.scrollTop = progressOutput.scrollHeight;
  });

  try {
    await window.electronAPI.downloadVideo({
      url: currentVideoUrl,
      formatId: selectedFormat,
      outputPath: selectedOutputPath,
    });

    if (isDownloading) {
      progressOutput.textContent += "\nDownload completed successfully.";
    }
  } catch (err) {
    if (isDownloading) {
      progressOutput.textContent += `\nError: ${getErrorMessage(
        err,
        "Unknown error",
      )}`;
    }
  } finally {
    isDownloading = false;
    downloadBtn.disabled = false;
    cancelBtn.classList.add("hidden");

    // Cleanup progress listener
    if (progressCleanup) {
      progressCleanup();
      progressCleanup = null;
    }
  }
});

// Cancel download
cancelBtn.addEventListener("click", async () => {
  if (!isDownloading) return;

  try {
    await window.electronAPI.cancelDownload();
    progressOutput.textContent += "\nDownload cancelled by user.";
    isDownloading = false;
    downloadBtn.disabled = false;
    cancelBtn.classList.add("hidden");

    if (progressCleanup) {
      progressCleanup();
      progressCleanup = null;
    }
  } catch (err) {
    progressOutput.textContent += `\nError cancelling: ${getErrorMessage(
      err,
      "Unknown error",
    )}`;
  }
});

// Utility functions
/**
 * @param {number} seconds
 * @returns {string}
 */
function formatDuration(seconds) {
  if (!seconds) return "Unknown";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "Size unknown";
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1,
  );
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * @param {number} count
 * @returns {string}
 */
function formatViews(count) {
  if (!count || count === 0) return "0 views";
  if (count === 1) return "1 view";
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + "M views";
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1) + "K views";
  }
  return count.toLocaleString() + " views";
}

/**
 * @param {number} num
 * @returns {string}
 */
function formatNumber(num) {
  if (!num || num === 0) return "0";
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toLocaleString();
}

/**
 * @param {string} dateString
 * @returns {string}
 */
function formatUploadDate(dateString) {
  if (!dateString) return "";
  // Format: YYYYMMDD
  const year = parseInt(dateString.substring(0, 4), 10);
  const month = parseInt(dateString.substring(4, 6), 10);
  const day = parseInt(dateString.substring(6, 8), 10);

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return "Today";
  } else if (diffDays === 1) {
    return "1 day ago";
  } else if (diffDays < 7) {
    return diffDays + " days ago";
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? "1 week ago" : weeks + " weeks ago";
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return months === 1 ? "1 month ago" : months + " months ago";
  } else {
    const years = Math.floor(diffDays / 365);
    return years === 1 ? "1 year ago" : years + " years ago";
  }
}

function showLoading() {
  loading.classList.remove("hidden");
}

function hideLoading() {
  loading.classList.add("hidden");
}

/**
 * @param {string} message
 */
function showError(message) {
  error.textContent = message;
  error.classList.remove("hidden");
}

function hideError() {
  error.classList.add("hidden");
}

function hideVideoInfo() {
  videoInfo.classList.add("hidden");
  downloadProgress.classList.add("hidden");
}

// Add back button functionality
function goBackToHome() {
  if (isDownloading) {
    const confirmLeave = window.confirm(
      "A download is currently in progress. Do you want to cancel the download and return to the home screen?",
    );
    if (!confirmLeave) {
      return;
    }
    window.electronAPI.cancelDownload().catch(() => {});
    isDownloading = false;
    if (progressCleanup) {
      progressCleanup();
      progressCleanup = null;
    }
    downloadBtn.disabled = false;
    cancelBtn.classList.add("hidden");
  }

  const homeScreen = document.getElementById("homeScreen");
  const mainApp = document.getElementById("mainApp");
  if (homeScreen) homeScreen.classList.remove("hidden");
  if (mainApp) mainApp.classList.add("hidden");
  if (urlInput) urlInput.value = "";
  if (headerUrlInput) headerUrlInput.value = "";
  currentVideoUrl = null;
  currentThumbnailUrl = null;
  currentVideoTitle = "thumbnail";
  if (downloadThumbnailBtn) downloadThumbnailBtn.disabled = true;
  resetSelectedFormat();
  hideVideoInfo();
  hideError();
  hideLoading();
}

// Dependency Management Logic
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const deps = await window.electronAPI.checkDependencies();
    const needsUpdate = deps.ytdlpOutdated;
    const isMissing = !deps.ytdlp || !deps.ffmpeg;

    if (isMissing || needsUpdate) {
      if (dependencyModal) dependencyModal.classList.remove("hidden");

      if (isMissing) {
        if (dependencyTitle)
          dependencyTitle.textContent = "Dependencies Required";
        if (dependencyMessage)
          dependencyMessage.textContent =
            "yt-dlp and ffmpeg are required to download videos. Please select an installation folder and install them.";
        if (dependencyFolderSection)
          dependencyFolderSection.classList.remove("hidden");
        if (dependencyActionBtn)
          dependencyActionBtn.textContent = "Install Missing Tools";
        if (deps.configuredDependencyPath && dependencyPathInput) {
          dependencyLocation = deps.configuredDependencyPath;
          dependencyPathInput.value = deps.configuredDependencyPath;
        }
      } else if (needsUpdate) {
        if (dependencyTitle) dependencyTitle.textContent = "Update Available";
        if (dependencyMessage)
          dependencyMessage.textContent =
            "An update for the download engine (yt-dlp) is available. Updating is recommended to avoid download failures.";
        if (dependencyFolderSection)
          dependencyFolderSection.classList.add("hidden");
        if (dependencyActionBtn) dependencyActionBtn.textContent = "Update Now";
      }

      // Update indicators
      if (ytdlpState) {
        ytdlpState.textContent = deps.ytdlp
          ? deps.ytdlpOutdated
            ? "Outdated"
            : "Installed"
          : "Missing";
        ytdlpState.className =
          "dep-state " +
          (deps.ytdlp
            ? deps.ytdlpOutdated
              ? "outdated"
              : "installed"
            : "missing");
      }

      if (ffmpegState) {
        ffmpegState.textContent = deps.ffmpeg ? "Installed" : "Missing";
        ffmpegState.className =
          "dep-state " + (deps.ffmpeg ? "installed" : "missing");
      }
    }
  } catch (error) {
    console.error("Failed to check dependencies:", error);
  }
});

if (dependencyBrowseBtn) {
  dependencyBrowseBtn.addEventListener("click", async () => {
    try {
      const folder = await window.electronAPI.selectFolder();
      if (folder && dependencyPathInput) {
        dependencyLocation = folder;
        dependencyPathInput.value = folder;
      }
    } catch (err) {
      console.error(err);
    }
  });
}

if (dependencyActionBtn) {
  dependencyActionBtn.addEventListener("click", async () => {
    const isInstall = dependencyActionBtn.textContent.includes("Install");

    if (isInstall && !dependencyLocation) {
      window.alert("Please select an installation folder first!");
      return;
    }

    dependencyActionBtn.disabled = true;
    if (dependencyBrowseBtn) dependencyBrowseBtn.disabled = true;
    if (dependencyProgress) dependencyProgress.classList.remove("hidden");

    try {
      if (isInstall) {
        if (dependencyProgressText)
          dependencyProgressText.textContent =
            "Downloading binaries... This may take a few minutes.";
        await window.electronAPI.downloadDependencies(dependencyLocation);
      } else {
        if (dependencyProgressText)
          dependencyProgressText.textContent = "Updating yt-dlp...";
        await window.electronAPI.updateDependencies();
      }

      // On success, hide modal
      if (dependencyModal) dependencyModal.classList.add("hidden");

      // Refresh state
      window.alert(
        isInstall ? "Dependencies installed successfully!" : "Update complete!",
      );
    } catch (err) {
      if (dependencyProgressText)
        dependencyProgressText.textContent = `Error: ${err.message || "Failed"}`;
      dependencyActionBtn.disabled = false;
      if (dependencyBrowseBtn) dependencyBrowseBtn.disabled = false;
    }
  });
}
