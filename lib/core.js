const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { spawn } = require("child_process");
const { URL } = require("url");

const MAX_THUMBNAIL_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const MAX_DEPENDENCY_DOWNLOAD_BYTES = 300 * 1024 * 1024;

/**
 * @param {string} urlString
 * @returns {boolean}
 */
function isValidYouTubeUrl(urlString) {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return false;
    }

    return (
      hostname === "youtu.be" ||
      hostname === "youtube.com" ||
      hostname.endsWith(".youtube.com")
    );
  } catch {
    return false;
  }
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function normalizeOutputPath(filePath) {
  if (filePath.includes("\0")) {
    throw new Error("Output path contains invalid characters");
  }

  if (!path.isAbsolute(filePath)) {
    throw new Error("Output path must be absolute");
  }

  return path.resolve(filePath);
}

/**
 * @param {string} filename
 * @returns {string}
 */
function sanitizeFilename(filename) {
  return Array.from(filename)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && !'<>:"/\\|?*'.includes(character);
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/**
 * @param {string} thumbnailUrl
 * @returns {string}
 */
function getThumbnailExtension(thumbnailUrl) {
  try {
    const extension = path
      .extname(new URL(thumbnailUrl).pathname)
      .toLowerCase()
      .replace(".", "");

    if (["jpg", "jpeg", "png", "webp"].includes(extension)) {
      return extension === "jpeg" ? "jpg" : extension;
    }
  } catch {
    // Fall through to the default extension.
  }

  return "jpg";
}

/**
 * @param {string} thumbnailUrl
 * @returns {boolean}
 */
function isValidThumbnailUrl(thumbnailUrl) {
  try {
    const parsedUrl = new URL(thumbnailUrl);
    return parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * @param {string} version
 * @returns {number[]}
 */
function parseVersionParts(version) {
  return version
    .replace(/^[^\d]*/, "")
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

/**
 * @param {string} latestVersion
 * @param {string} localVersion
 * @returns {boolean}
 */
function isNewerVersion(latestVersion, localVersion) {
  const latestParts = parseVersionParts(latestVersion);
  const localParts = parseVersionParts(localVersion);
  const maxLength = Math.max(latestParts.length, localParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const latestPart = latestParts[index] || 0;
    const localPart = localParts[index] || 0;

    if (latestPart > localPart) return true;
    if (latestPart < localPart) return false;
  }

  return false;
}

/**
 * @param {string} sourceUrl
 * @param {string} destinationPath
 * @param {number} redirectsRemaining
 * @returns {Promise<void>}
 */
function downloadFile(sourceUrl, destinationPath, redirectsRemaining = 5) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(sourceUrl);
    } catch {
      reject(new Error("Invalid thumbnail URL"));
      return;
    }

    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      reject(new Error("Thumbnail download must use HTTP or HTTPS"));
      return;
    }

    const client = parsedUrl.protocol === "https:" ? https : http;
    const tempPath = `${destinationPath}.${process.pid}.${Date.now()}.download`;
    const request = client.get(parsedUrl, (response) => {
      const statusCode = response.statusCode || 0;

      if (
        statusCode >= 300 &&
        statusCode < 400 &&
        response.headers.location &&
        redirectsRemaining > 0
      ) {
        response.resume();
        const redirectUrl = new URL(response.headers.location, sourceUrl).href;
        downloadFile(redirectUrl, destinationPath, redirectsRemaining - 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (statusCode !== 200) {
        response.resume();
        reject(new Error(`Thumbnail request failed with status ${statusCode}`));
        return;
      }

      const contentLength = Number(response.headers["content-length"] || 0);
      if (contentLength > MAX_THUMBNAIL_DOWNLOAD_BYTES) {
        response.resume();
        reject(new Error("Thumbnail file is too large"));
        return;
      }

      let receivedBytes = 0;
      const fileStream = fs.createWriteStream(tempPath, { flags: "wx" });

      response.on("data", (chunk) => {
        receivedBytes += chunk.length;
        if (receivedBytes > MAX_THUMBNAIL_DOWNLOAD_BYTES) {
          request.destroy(new Error("Thumbnail file is too large"));
        }
      });

      fileStream.on("finish", () => {
        fileStream.close(async (error) => {
          if (error) {
            reject(error);
            return;
          }

          try {
            await fs.promises.rename(tempPath, destinationPath);
            resolve();
          } catch (renameError) {
            fs.promises.unlink(tempPath).catch(() => {});
            reject(renameError);
          }
        });
      });

      fileStream.on("error", (error) => {
        response.destroy();
        fs.promises.unlink(tempPath).catch(() => {});
        reject(error);
      });

      response.pipe(fileStream);
    });

    request.setTimeout(30000, () => {
      request.destroy(new Error("Thumbnail download timed out"));
    });

    request.on("error", (error) => {
      fs.promises.unlink(tempPath).catch(() => {});
      reject(error);
    });
  });
}

/**
 * @param {string} location
 * @returns {Promise<string>}
 */
async function prepareDependencyDirectory(location) {
  if (typeof location !== "string" || !location.trim()) {
    throw new Error("Invalid dependency installation folder");
  }

  const safePath = normalizeOutputPath(location.trim());
  await fs.promises.mkdir(safePath, { recursive: true });

  const stats = await fs.promises.stat(safePath);
  if (!stats.isDirectory()) {
    throw new Error("Dependency installation path is not a folder");
  }

  await fs.promises.access(safePath, fs.constants.W_OK);
  return safePath;
}

/**
 * @param {string} sourceUrl
 * @param {string} destPath
 * @param {number} redirectsRemaining
 * @returns {Promise<void>}
 */
function downloadBinary(sourceUrl, destPath, redirectsRemaining = 5) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(sourceUrl);
    } catch {
      reject(new Error("Invalid dependency download URL"));
      return;
    }

    if (parsedUrl.protocol !== "https:") {
      reject(new Error("Dependency downloads must use HTTPS"));
      return;
    }

    const tempPath = `${destPath}.${process.pid}.${Date.now()}.download`;
    const req = https.get(
      parsedUrl,
      { headers: { "User-Agent": "Mozilla/5.0" } },
      (res) => {
        const statusCode = res.statusCode || 0;

        if (
          statusCode >= 300 &&
          statusCode < 400 &&
          res.headers.location &&
          redirectsRemaining > 0
        ) {
          res.resume();
          const redirectUrl = new URL(res.headers.location, sourceUrl).href;
          downloadBinary(redirectUrl, destPath, redirectsRemaining - 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (statusCode !== 200) {
          res.resume();
          reject(new Error(`Failed to download dependency: ${statusCode}`));
          return;
        }

        const contentLength = Number(res.headers["content-length"] || 0);
        if (contentLength > MAX_DEPENDENCY_DOWNLOAD_BYTES) {
          res.resume();
          reject(new Error("Dependency download is too large"));
          return;
        }

        let receivedBytes = 0;
        const file = fs.createWriteStream(tempPath, { flags: "wx" });

        res.on("data", (chunk) => {
          receivedBytes += chunk.length;
          if (receivedBytes > MAX_DEPENDENCY_DOWNLOAD_BYTES) {
            req.destroy(new Error("Dependency download is too large"));
          }
        });

        res.pipe(file);

        file.on("finish", () => {
          file.close(async (error) => {
            if (error) {
              reject(error);
              return;
            }

            try {
              await fs.promises.rename(tempPath, destPath);
              resolve();
            } catch (renameError) {
              fs.promises.unlink(tempPath).catch(() => {});
              reject(renameError);
            }
          });
        });

        file.on("error", (error) => {
          res.destroy();
          fs.promises.unlink(tempPath).catch(() => {});
          reject(error);
        });
      },
    );

    req.setTimeout(120000, () => {
      req.destroy(new Error("Dependency download timed out"));
    });

    req.on("error", (error) => {
      fs.promises.unlink(tempPath).catch(() => {});
      reject(error);
    });
  });
}

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<void>}
 */
function runArchiveTool(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code}`));
    });

    child.on("error", reject);
  });
}

/**
 * @param {string} dir
 * @param {string} toolFile
 * @returns {string | null}
 */
function findExtractedExecutable(dir, toolFile) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  const expectedName = toolFile.toLowerCase();

  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      const foundPath = findExtractedExecutable(fullPath, toolFile);
      if (foundPath) return foundPath;
    } else if (file.isFile() && file.name.toLowerCase() === expectedName) {
      return fullPath;
    }
  }

  return null;
}

/**
 * @param {string} archivePath
 * @param {string} destDir
 * @param {string} toolFile
 * @returns {Promise<void>}
 */
async function extractArchive(archivePath, destDir, toolFile) {
  const extractDir = path.join(destDir, `.extract-${Date.now()}`);
  await fs.promises.mkdir(extractDir, { recursive: true });

  try {
    if (archivePath.endsWith(".zip")) {
      if (process.platform === "win32") {
        await runArchiveTool("tar", ["-xf", archivePath, "-C", extractDir]);
      } else {
        await runArchiveTool("unzip", ["-q", "-o", archivePath, "-d", extractDir]);
      }
    } else if (
      archivePath.endsWith(".tar.xz") ||
      archivePath.endsWith(".tar.gz")
    ) {
      await runArchiveTool("tar", ["-xf", archivePath, "-C", extractDir]);
    } else {
      throw new Error("Unsupported dependency archive format");
    }

    const executablePath = findExtractedExecutable(extractDir, toolFile);
    if (!executablePath) {
      throw new Error(`Unable to find ${toolFile} in downloaded archive`);
    }

    await fs.promises.copyFile(executablePath, path.join(destDir, toolFile));
  } finally {
    await fs.promises.rm(extractDir, { recursive: true, force: true });
  }
}

/**
 * @param {string} dirPath
 * @returns {Promise<string>}
 */
async function validateWritableDirectory(dirPath) {
  if (typeof dirPath !== "string" || !dirPath.trim()) {
    throw new Error("Invalid directory path provided");
  }

  const safePath = normalizeOutputPath(dirPath.trim());
  const stats = await fs.promises.stat(safePath);
  if (!stats.isDirectory()) {
    throw new Error("Output path is not a directory");
  }

  await fs.promises.access(safePath, fs.constants.W_OK);
  return safePath;
}

/**
 * @param {string} url
 * @returns {boolean}
 */
function isSafeExternalUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * @param {unknown} error
 * @param {string} fallback
 * @returns {Error}
 */
function toError(error, fallback) {
  if (error instanceof Error) return error;

  if (error && typeof error === "object") {
    const maybeError = /** @type {{ error?: unknown, message?: unknown, details?: unknown }} */ (
      error
    );
    const message =
      typeof maybeError.error === "string"
        ? maybeError.error
        : typeof maybeError.message === "string"
          ? maybeError.message
          : fallback;
    const details =
      typeof maybeError.details === "string" && maybeError.details.trim()
        ? `\n${maybeError.details.trim()}`
        : "";
    return new Error(`${message}${details}`);
  }

  return new Error(fallback);
}

/**
 * @param {string} executableName
 * @param {string[]} commonPaths
 * @param {string | null} [userPath]
 * @returns {string[]}
 */
function getExecutableCandidates(executableName, commonPaths, userPath = null) {
  const candidates = [];

  if (userPath) {
    candidates.push(path.join(userPath, executableName));
  }

  candidates.push(...commonPaths);
  candidates.push(executableName);

  return Array.from(new Set(candidates));
}

module.exports = {
  MAX_DEPENDENCY_DOWNLOAD_BYTES,
  MAX_THUMBNAIL_DOWNLOAD_BYTES,
  downloadBinary,
  downloadFile,
  extractArchive,
  findExtractedExecutable,
  getExecutableCandidates,
  getThumbnailExtension,
  isNewerVersion,
  isSafeExternalUrl,
  isValidThumbnailUrl,
  isValidYouTubeUrl,
  normalizeOutputPath,
  parseVersionParts,
  prepareDependencyDirectory,
  sanitizeFilename,
  toError,
  validateWritableDirectory,
};

