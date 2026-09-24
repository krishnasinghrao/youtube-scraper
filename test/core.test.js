const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const test = require("node:test");

const {
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
} = require("../lib/core");

/**
 * @param {number} statusCode
 * @param {Record<string, string | number>} headers
 * @param {string | Buffer} body
 * @returns {PassThrough & { statusCode: number, headers: Record<string, string | number> }}
 */
function createMockResponse(statusCode, headers = {}, body = "") {
  const response = new PassThrough();
  response.statusCode = statusCode;
  response.headers = headers;

  process.nextTick(() => {
    response.end(body);
  });

  return response;
}

/**
 * @param {(url: URL) => PassThrough & { statusCode: number, headers: Record<string, string | number> }} handler
 * @returns {(url: URL, callback: (response: PassThrough) => void) => EventEmitter & { setTimeout: () => void, destroy: (error?: Error) => void }}
 */
function createMockGet(handler) {
  return (url, callback) => {
    const request = new EventEmitter();
    request.setTimeout = () => {};
    request.destroy = (error) => {
      if (error) process.nextTick(() => request.emit("error", error));
    };

    process.nextTick(() => {
      callback(handler(url));
    });

    return request;
  };
}

test("isValidYouTubeUrl accepts supported YouTube hosts only", () => {
  assert.equal(isValidYouTubeUrl("https://youtube.com/watch?v=abc"), true);
  assert.equal(isValidYouTubeUrl("https://www.youtube.com/watch?v=abc"), true);
  assert.equal(isValidYouTubeUrl("http://m.youtube.com/watch?v=abc"), true);
  assert.equal(isValidYouTubeUrl("https://youtu.be/abc"), true);

  assert.equal(isValidYouTubeUrl("ftp://youtube.com/watch?v=abc"), false);
  assert.equal(isValidYouTubeUrl("https://notyoutube.com/watch?v=abc"), false);
  assert.equal(isValidYouTubeUrl("https://youtube.com.evil.test/x"), false);
  assert.equal(isValidYouTubeUrl("not a url"), false);
});

test("thumbnail URL helpers validate protocols and derive safe extensions", () => {
  assert.equal(isValidThumbnailUrl("https://i.ytimg.com/vi/id/maxres.jpg"), true);
  assert.equal(isValidThumbnailUrl("http://i.ytimg.com/vi/id/maxres.webp"), true);
  assert.equal(isValidThumbnailUrl("file:///tmp/image.jpg"), false);
  assert.equal(isValidThumbnailUrl("bad"), false);

  assert.equal(getThumbnailExtension("https://host/image.jpeg?size=large"), "jpg");
  assert.equal(getThumbnailExtension("https://host/image.PNG"), "png");
  assert.equal(getThumbnailExtension("https://host/image.webp"), "webp");
  assert.equal(getThumbnailExtension("https://host/image.svg"), "jpg");
  assert.equal(getThumbnailExtension("not a url"), "jpg");
});

test("sanitizeFilename removes unsafe characters, compresses whitespace, and caps length", () => {
  const unsafe = '  bad<>:"/\\|?*\n\tname  ';
  assert.equal(sanitizeFilename(unsafe), "badname");

  const longName = "a".repeat(200);
  assert.equal(sanitizeFilename(longName).length, 120);

  const controlOnly = "\u0000\u001f";
  assert.equal(sanitizeFilename(controlOnly), "");
});

test("normalizeOutputPath rejects relative and null-byte paths", () => {
  assert.throws(
    () => normalizeOutputPath("relative/path"),
    /Output path must be absolute/,
  );
  assert.throws(
    () => normalizeOutputPath(`${path.resolve(os.tmpdir())}\0bad`),
    /invalid characters/,
  );

  const normalized = normalizeOutputPath(path.join(os.tmpdir(), "..", "tmp"));
  assert.equal(path.isAbsolute(normalized), true);
});

test("version parsing and comparison handles yt-dlp release-style versions", () => {
  assert.deepEqual(parseVersionParts("2026.05.14"), [2026, 5, 14]);
  assert.deepEqual(parseVersionParts("v2026.05.14"), [2026, 5, 14]);
  assert.deepEqual(parseVersionParts("2026.05.14.1"), [2026, 5, 14, 1]);

  assert.equal(isNewerVersion("2026.05.14", "2026.05.13"), true);
  assert.equal(isNewerVersion("2026.05.14.1", "2026.05.14"), true);
  assert.equal(isNewerVersion("2026.05.14", "2026.05.14.1"), false);
  assert.equal(isNewerVersion("2026.05.14", "2026.05.14"), false);
  assert.equal(isNewerVersion("2025.12.31", "2026.01.01"), false);
});

test("prepareDependencyDirectory creates absolute writable directories", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "scraper-test-"));
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));

  const installPath = path.join(root, "deps", "bin");
  const preparedPath = await prepareDependencyDirectory(installPath);
  const stats = await fs.promises.stat(preparedPath);

  assert.equal(preparedPath, installPath);
  assert.equal(stats.isDirectory(), true);

  await assert.rejects(
    () => prepareDependencyDirectory("relative/deps"),
    /absolute/,
  );

  const filePath = path.join(root, "not-a-directory");
  await fs.promises.writeFile(filePath, "content");
  await assert.rejects(
    () => prepareDependencyDirectory(filePath),
    /not a folder|EEXIST/,
  );
});

test("findExtractedExecutable searches nested extracted archives by exact filename", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "scraper-test-"));
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));

  const nested = path.join(root, "archive", "bin");
  await fs.promises.mkdir(nested, { recursive: true });
  await fs.promises.writeFile(path.join(nested, "ffprobe"), "");
  const ffmpegPath = path.join(nested, "ffmpeg");
  await fs.promises.writeFile(ffmpegPath, "");

  assert.equal(findExtractedExecutable(root, "ffmpeg"), ffmpegPath);
  assert.equal(findExtractedExecutable(root, "yt-dlp"), null);
});

test("downloadFile writes successful responses atomically", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "scraper-test-"));
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));

  t.mock.method(
    http,
    "get",
    createMockGet((url) => {
      assert.equal(url.pathname, "/image.jpg");
      return createMockResponse(
        200,
        {
          "content-length": Buffer.byteLength("image-bytes"),
          "content-type": "image/jpeg",
        },
        "image-bytes",
      );
    }),
  );

  const destination = path.join(root, "image.jpg");
  await downloadFile("http://example.test/image.jpg", destination);

  assert.equal(await fs.promises.readFile(destination, "utf8"), "image-bytes");
});

test("downloadFile follows redirects and rejects non-200 responses", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "scraper-test-"));
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));

  t.mock.method(
    http,
    "get",
    createMockGet((url) => {
      if (url.pathname === "/redirect") {
        return createMockResponse(302, { location: "/ok" });
      }

      if (url.pathname === "/ok") {
        return createMockResponse(200, { "content-length": 2 }, "ok");
      }

      return createMockResponse(404, {}, "missing");
    }),
  );

  const destination = path.join(root, "redirect.jpg");
  await downloadFile("http://example.test/redirect", destination);
  assert.equal(await fs.promises.readFile(destination, "utf8"), "ok");

  await assert.rejects(
    () => downloadFile("http://example.test/missing", path.join(root, "missing.jpg")),
    /status 404/,
  );
});

test("downloadFile rejects oversized thumbnails before writing a destination", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "scraper-test-"));
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));

  t.mock.method(
    http,
    "get",
    createMockGet(() =>
      createMockResponse(200, {
        "content-length": MAX_THUMBNAIL_DOWNLOAD_BYTES + 1,
      }),
    ),
  );

  const destination = path.join(root, "too-large.jpg");
  await assert.rejects(
    () => downloadFile("http://example.test/too-large", destination),
    /too large/,
  );
  await assert.rejects(() => fs.promises.stat(destination), /ENOENT/);
});

test("downloadBinary rejects invalid or non-HTTPS dependency URLs", async () => {
  await assert.rejects(
    () => downloadBinary("not a url", path.join(os.tmpdir(), "yt-dlp")),
    /Invalid dependency download URL/,
  );

  await assert.rejects(
    () => downloadBinary("http://example.test/yt-dlp", path.join(os.tmpdir(), "yt-dlp")),
    /must use HTTPS/,
  );
});

test("downloadFile rejects invalid URLs and unsupported protocols", async () => {
  await assert.rejects(
    () => downloadFile("not a url", path.join(os.tmpdir(), "thumb.jpg")),
    /Invalid thumbnail URL/,
  );

  await assert.rejects(
    () => downloadFile("ftp://example.test/thumb.jpg", path.join(os.tmpdir(), "thumb.jpg")),
    /Thumbnail download must use HTTP or HTTPS/,
  );
});

test("validateWritableDirectory validates existing directory and rejects invalid inputs", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "scraper-val-"));
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));

  const validated = await validateWritableDirectory(root);
  assert.equal(validated, root);

  await assert.rejects(
    () => validateWritableDirectory("   "),
    /Invalid directory path provided/,
  );

  await assert.rejects(
    () => validateWritableDirectory("relative/path"),
    /Output path must be absolute/,
  );

  const file = path.join(root, "file.txt");
  await fs.promises.writeFile(file, "hello");
  await assert.rejects(
    () => validateWritableDirectory(file),
    /Output path is not a directory/,
  );

  const nonExistent = path.join(root, "does-not-exist");
  await assert.rejects(
    () => validateWritableDirectory(nonExistent),
    /ENOENT/,
  );
});

test("isSafeExternalUrl accepts https/http and rejects unsafe protocols", () => {
  assert.equal(isSafeExternalUrl("https://github.com"), true);
  assert.equal(isSafeExternalUrl("http://example.com"), true);
  assert.equal(isSafeExternalUrl("ftp://example.com"), false);
  assert.equal(isSafeExternalUrl("javascript:alert(1)"), false);
  assert.equal(isSafeExternalUrl("file:///etc/passwd"), false);
  assert.equal(isSafeExternalUrl("not a url"), false);
});

test("toError formats Error instances, error-like objects, and fallbacks", () => {
  const original = new Error("native error");
  assert.equal(toError(original, "fallback"), original);

  const objWithError = { error: "custom error", details: "more details" };
  const err1 = toError(objWithError, "fallback");
  assert.equal(err1.message, "custom error\nmore details");

  const objWithMessage = { message: "msg only" };
  const err2 = toError(objWithMessage, "fallback");
  assert.equal(err2.message, "msg only");

  const fallbackErr = toError("string error", "default fallback");
  assert.equal(fallbackErr.message, "default fallback");
});

test("getExecutableCandidates prioritizes user path, merges paths, and deduplicates", () => {
  const candidates = getExecutableCandidates(
    "tool",
    ["/bin/tool", "/usr/bin/tool", "tool"],
    "/custom/dir",
  );

  assert.equal(candidates[0], path.join("/custom/dir", "tool"));
  assert.ok(candidates.includes("/bin/tool"));
  assert.ok(candidates.includes("/usr/bin/tool"));
  assert.ok(candidates.includes("tool"));
  // Unique items check
  assert.equal(new Set(candidates).size, candidates.length);
});

test("extractArchive rejects unsupported archive formats", async () => {
  await assert.rejects(
    () => extractArchive("file.rar", "/tmp", "tool"),
    /Unsupported dependency archive format/,
  );
});

