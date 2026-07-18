import http from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SEED_CONFIG_PATH = path.join(ROOT, "data", "config.json");
const PERSIST_ROOT = process.env.PERSIST_ROOT ? path.resolve(process.env.PERSIST_ROOT) : ROOT;
const DATA_DIR = path.join(PERSIST_ROOT, "data");
const UPLOAD_DIR = path.join(PERSIST_ROOT, "uploads");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const BACKUP_PATH = path.join(DATA_DIR, "config.backup.json");
const PORT = Number(process.env.PORT || 8080);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SESSION_TTL = 12 * 60 * 60 * 1000;
const sessions = new Map();
const loginAttempts = new Map();
const LOGIN_WINDOW = 10 * 60 * 1000;
const LOGIN_LIMIT = 8;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

await mkdir(DATA_DIR, { recursive: true });
await mkdir(UPLOAD_DIR, { recursive: true });
try {
  await stat(CONFIG_PATH);
} catch {
  if (CONFIG_PATH !== SEED_CONFIG_PATH) await copyFile(SEED_CONFIG_PATH, CONFIG_PATH);
}

function json(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'"
  };
}

async function readJsonBody(req, maxBytes = 8 * 1024 * 1024) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error("请求内容过大");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("JSON格式不正确");
  }
}

function parseCookies(req) {
  const cookies = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function currentSession(req) {
  const token = parseCookies(req).wp_admin_session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL;
  return { token, ...session };
}

function requireAdmin(req, res) {
  const session = currentSession(req);
  if (!session) {
    json(res, 401, { ok: false, message: "请先登录后台" }, securityHeaders());
    return null;
  }
  return session;
}

function safeEqual(left, right) {
  const a = createHash("sha256").update(String(left)).digest();
  const b = createHash("sha256").update(String(right)).digest();
  return timingSafeEqual(a, b);
}

function loginAttemptState(req) {
  const key = req.socket.remoteAddress || "unknown";
  const current = loginAttempts.get(key);
  if (!current || current.resetAt < Date.now()) {
    const fresh = { key, count: 0, resetAt: Date.now() + LOGIN_WINDOW };
    loginAttempts.set(key, fresh);
    return fresh;
  }
  return { key, ...current };
}

function recordLoginFailure(attempt) {
  loginAttempts.set(attempt.key, { count: attempt.count + 1, resetAt: attempt.resetAt });
}

function cleanText(value, maxLength = 180) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function cleanUrl(value) {
  const url = cleanText(value, 2000);
  if (!url) return "";
  if (url.startsWith("/") || url.startsWith("./") || url.startsWith("data:image/")) return url;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function isSupportedImageBuffer(buffer, extension) {
  if (extension === "png") {
    return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (extension === "jpg") return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (extension === "webp") return buffer.length > 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function normalizeConfig(input, previous = {}) {
  if (!input || typeof input !== "object") throw new Error("配置内容不正确");
  const settings = {};
  for (const [key, value] of Object.entries(input.settings || {})) {
    settings[cleanText(key, 80)] = cleanText(value, 500);
  }

  const theme = {
    accent: /^#[0-9a-f]{6}$/i.test(input.theme?.accent || "") ? input.theme.accent : "#ff725f",
    accentSecondary: /^#[0-9a-f]{6}$/i.test(input.theme?.accentSecondary || "") ? input.theme.accentSecondary : "#ff8a59",
    pageBackground: /^#[0-9a-f]{6}$/i.test(input.theme?.pageBackground || "") ? input.theme.pageBackground : "#eaf8fa"
  };

  const sources = (Array.isArray(input.sources) ? input.sources : []).slice(0, 12).map((source, index) => ({
    id: cleanText(source.id || `source-${index + 1}`, 40).replace(/[^a-zA-Z0-9_-]/g, "-") || `source-${index + 1}`,
    label: cleanText(source.label || `网盘${index + 1}`, 40),
    defaultLink: cleanUrl(source.defaultLink)
  }));

  const sourceIds = new Set(sources.map((source) => source.id));
  const resources = (Array.isArray(input.resources) ? input.resources : []).slice(0, 500).map((resource, index) => {
    const links = {};
    for (const [sourceId, link] of Object.entries(resource.links || {})) {
      if (sourceIds.has(sourceId) && cleanUrl(link)) links[sourceId] = cleanUrl(link);
    }
    return {
      id: Number.isFinite(Number(resource.id)) ? Number(resource.id) : Date.now() + index,
      title: cleanText(resource.title || `未命名资源${index + 1}`, 160),
      artTitle: cleanText(resource.artTitle || resource.title || "未命名", 60),
      category: cleanText(resource.category || "其他", 40),
      heat: Math.max(0, Math.min(999999, Number(resource.heat) || 0)),
      rating: Math.max(0, Math.min(10, Number(resource.rating) || 0)),
      update: cleanText(resource.update, 80),
      image: cleanUrl(resource.image),
      colors: Array.isArray(resource.colors) && resource.colors.length >= 2 ? resource.colors.slice(0, 2).map((color) => /^#[0-9a-f]{6}$/i.test(color) ? color : "#26354f") : ["#26354f", "#7786a5"],
      links,
      visible: resource.visible !== false
    };
  });

  return {
    meta: {
      version: Number(previous.meta?.version || 0) + 1,
      updatedAt: new Date().toISOString()
    },
    settings,
    theme,
    categoryOrder: (Array.isArray(input.categoryOrder) ? input.categoryOrder : []).slice(0, 50).map((item) => cleanText(item, 40)).filter(Boolean),
    sources,
    resources
  };
}

async function loadConfig() {
  return JSON.parse(await readFile(CONFIG_PATH, "utf8"));
}

async function saveConfig(nextConfig) {
  const previous = await loadConfig();
  const normalized = normalizeConfig(nextConfig, previous);
  const temporaryPath = path.join(DATA_DIR, `config.${randomBytes(5).toString("hex")}.tmp`);
  await copyFile(CONFIG_PATH, BACKUP_PATH);
  await writeFile(temporaryPath, JSON.stringify(normalized, null, 2) + "\n", "utf8");
  await rename(temporaryPath, CONFIG_PATH);
  return normalized;
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/config") {
    return json(res, 200, await loadConfig(), securityHeaders());
  }

  if (req.method === "GET" && url.pathname === "/api/auth/status") {
    return json(res, 200, { ok: true, authenticated: Boolean(currentSession(req)), username: ADMIN_USERNAME }, securityHeaders());
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const attempt = loginAttemptState(req);
    if (attempt.count >= LOGIN_LIMIT) {
      return json(res, 429, { ok: false, message: "尝试次数过多，请稍后再试" }, securityHeaders());
    }
    const body = await readJsonBody(req, 64 * 1024);
    if (!safeEqual(body.username, ADMIN_USERNAME) || !safeEqual(body.password, ADMIN_PASSWORD)) {
      recordLoginFailure(attempt);
      return json(res, 401, { ok: false, message: "账号或密码错误" }, securityHeaders());
    }
    loginAttempts.delete(attempt.key);
    const token = randomBytes(32).toString("hex");
    sessions.set(token, { username: ADMIN_USERNAME, expiresAt: Date.now() + SESSION_TTL });
    return json(res, 200, { ok: true, username: ADMIN_USERNAME }, {
      ...securityHeaders(),
      "Set-Cookie": `wp_admin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}`
    });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const session = currentSession(req);
    if (session) sessions.delete(session.token);
    return json(res, 200, { ok: true }, {
      ...securityHeaders(),
      "Set-Cookie": "wp_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"
    });
  }

  if (url.pathname.startsWith("/api/admin/") && !requireAdmin(req, res)) return;

  if (req.method === "GET" && url.pathname === "/api/admin/config") {
    return json(res, 200, await loadConfig(), securityHeaders());
  }

  if (req.method === "PUT" && url.pathname === "/api/admin/config") {
    const body = await readJsonBody(req);
    const saved = await saveConfig(body);
    return json(res, 200, { ok: true, config: saved, message: "保存成功，前台已更新" }, securityHeaders());
  }

  if (req.method === "POST" && url.pathname === "/api/admin/upload") {
    const body = await readJsonBody(req);
    const match = String(body.dataUrl || "").match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return json(res, 400, { ok: false, message: "仅支持PNG、JPG和WEBP图片" }, securityHeaders());
    const extension = match[1] === "jpeg" ? "jpg" : match[1];
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
      return json(res, 400, { ok: false, message: "图片大小需在5MB以内" }, securityHeaders());
    }
    if (!isSupportedImageBuffer(buffer, extension)) {
      return json(res, 400, { ok: false, message: "图片文件内容不正确" }, securityHeaders());
    }
    const filename = `${Date.now()}-${randomBytes(6).toString("hex")}.${extension}`;
    await writeFile(path.join(UPLOAD_DIR, filename), buffer);
    return json(res, 200, { ok: true, url: `/uploads/${filename}` }, securityHeaders());
  }

  return json(res, 404, { ok: false, message: "接口不存在" }, securityHeaders());
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  if (pathname === "/admin" || pathname === "/admin/") pathname = "/admin.html";
  if (pathname.startsWith("/data/") || pathname.endsWith(".mjs") || pathname === "/package.json") {
    res.writeHead(404, securityHeaders());
    return res.end("Not found");
  }

  const servingUploads = pathname.startsWith("/uploads/");
  const allowedRoot = servingUploads ? UPLOAD_DIR : ROOT;
  const relativePath = servingUploads ? pathname.slice("/uploads/".length) : "." + pathname;
  const filePath = path.resolve(allowedRoot, relativePath);
  if (filePath !== allowedRoot && !filePath.startsWith(allowedRoot + path.sep)) {
    res.writeHead(403, securityHeaders());
    return res.end("Forbidden");
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("Not a file");
    const content = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      ...securityHeaders(),
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Content-Length": content.length,
      "Cache-Control": pathname.startsWith("/uploads/") || pathname.startsWith("/assets/") ? "public, max-age=86400" : "no-cache"
    });
    res.end(content);
  } catch {
    res.writeHead(404, { ...securityHeaders(), "Content-Type": "text/plain; charset=utf-8" });
    res.end("页面不存在");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
    else await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, 500, { ok: false, message: error.message || "服务器处理失败" }, securityHeaders());
    else res.end();
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`前台: http://localhost:${PORT}`);
  console.log(`后台: http://localhost:${PORT}/admin`);
  if (ADMIN_PASSWORD === "admin123") console.log("提示: 当前使用默认后台密码，上线前请设置 ADMIN_PASSWORD 环境变量。");
});
