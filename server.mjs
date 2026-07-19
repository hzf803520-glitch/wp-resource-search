import http from "node:http";
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SEED_CONFIG_PATH = path.join(ROOT, "data", "config.json");
const SEED_ADMINS_PATH = path.join(ROOT, "data", "admins.seed.json");
const PERSIST_ROOT = process.env.PERSIST_ROOT ? path.resolve(process.env.PERSIST_ROOT) : ROOT;
const DATA_DIR = path.join(PERSIST_ROOT, "data");
const UPLOAD_DIR = path.join(PERSIST_ROOT, "uploads");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const BACKUP_PATH = path.join(DATA_DIR, "config.backup.json");
const ADMINS_PATH = path.join(DATA_DIR, "admins.json");
const PORT = Number(process.env.PORT || 8080);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const DATABASE_SSL = DATABASE_URL && !/(localhost|127\.0\.0\.1)/i.test(DATABASE_URL)
  ? { rejectUnauthorized: false }
  : false;
const database = DATABASE_URL
  ? new Pool({ connectionString: DATABASE_URL, ssl: DATABASE_SSL, max: 3, idleTimeoutMillis: 30000 })
  : null;
const SESSION_TTL = 12 * 60 * 60 * 1000;
const SESSION_SECRET = process.env.SESSION_SECRET || createHash("sha256")
  .update(`wp-resource-search:${ADMIN_USERNAME}:${ADMIN_PASSWORD}`)
  .digest("hex");
const loginAttempts = new Map();
const LOGIN_WINDOW = 10 * 60 * 1000;
const LOGIN_LIMIT = 8;
const PERMISSIONS = ["content", "appearance", "resources", "uploads", "admins"];

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

let adminStore;
let configCache;
let storageMode = "local";

async function readSeedJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return structuredClone(fallback);
  }
}

async function initializeLocalStorage(seedConfig, seedAdmins) {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(UPLOAD_DIR, { recursive: true });
  try {
    await stat(CONFIG_PATH);
  } catch {
    await writeFile(CONFIG_PATH, JSON.stringify(seedConfig, null, 2) + "\n", "utf8");
  }
  try {
    await stat(ADMINS_PATH);
  } catch {
    await writeFile(ADMINS_PATH, JSON.stringify(seedAdmins, null, 2) + "\n", "utf8");
  }
  configCache = await readSeedJson(CONFIG_PATH, seedConfig);
  const storedAdmins = await readSeedJson(ADMINS_PATH, seedAdmins);
  adminStore = {
    version: Number(storedAdmins.version) || 1,
    admins: Array.isArray(storedAdmins.admins) ? storedAdmins.admins : []
  };
  storageMode = "local";
  console.warn("DATABASE_URL 未配置：当前仍使用临时文件，Render 重启后数据会丢失。");
}

async function initializeDatabaseStorage(seedConfig, seedAdmins) {
  await database.query(`
    CREATE TABLE IF NOT EXISTS wp_app_state (
      state_key TEXT PRIMARY KEY,
      state_value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await database.query(
    `INSERT INTO wp_app_state (state_key, state_value)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (state_key) DO NOTHING`,
    ["config", JSON.stringify(seedConfig)]
  );
  await database.query(
    `INSERT INTO wp_app_state (state_key, state_value)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (state_key) DO NOTHING`,
    ["admins", JSON.stringify(seedAdmins)]
  );
  const result = await database.query(
    `SELECT state_key, state_value FROM wp_app_state WHERE state_key = ANY($1::text[])`,
    [["config", "admins"]]
  );
  const states = Object.fromEntries(result.rows.map((row) => [row.state_key, row.state_value]));
  configCache = states.config || seedConfig;
  const storedAdmins = states.admins || seedAdmins;
  adminStore = {
    version: Number(storedAdmins.version) || 1,
    admins: Array.isArray(storedAdmins.admins) ? storedAdmins.admins : []
  };
  storageMode = "postgres";
  console.log("Persistent PostgreSQL storage connected.");
}

async function persistDatabaseState(key, value) {
  await database.query(
    `INSERT INTO wp_app_state (state_key, state_value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (state_key)
     DO UPDATE SET state_value = EXCLUDED.state_value, updated_at = NOW()`,
    [key, JSON.stringify(value)]
  );
}

async function initializeStorage() {
  const seedConfig = await readSeedJson(SEED_CONFIG_PATH, {
    meta: { version: 1, updatedAt: new Date().toISOString() },
    settings: {}, theme: {}, categoryOrder: [], sources: [], resources: []
  });
  const seedAdmins = await readSeedJson(SEED_ADMINS_PATH, { version: 1, admins: [] });
  if (database) {
    try {
      await initializeDatabaseStorage(seedConfig, seedAdmins);
      return;
    } catch (error) {
      console.error("PostgreSQL initialization failed:", error);
      throw new Error("数据库连接失败，已停止启动以防止资源继续写入临时磁盘");
    }
  }
  await initializeLocalStorage(seedConfig, seedAdmins);
}

await initializeStorage();

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

async function readJsonBody(req, maxBytes = 64 * 1024 * 1024) {
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

function safeEqual(left, right) {
  const a = createHash("sha256").update(String(left)).digest();
  const b = createHash("sha256").update(String(right)).digest();
  return timingSafeEqual(a, b);
}

function normalizeUsername(value) {
  return cleanText(value, 32).toLowerCase();
}

function cleanPermissions(value) {
  const requested = Array.isArray(value) ? value : [];
  return [...new Set(requested.filter((permission) => PERMISSIONS.includes(permission)))];
}

function rootPrincipal() {
  return {
    userId: "root",
    username: ADMIN_USERNAME,
    displayName: "主管理员",
    permissions: [...PERMISSIONS],
    enabled: true,
    isRoot: true
  };
}

function storedPrincipal(userId) {
  const admin = adminStore.admins.find((item) => item.id === userId);
  if (!admin) return null;
  return {
    userId: admin.id,
    username: admin.username,
    displayName: admin.displayName,
    permissions: cleanPermissions(admin.permissions),
    enabled: admin.enabled !== false,
    isRoot: false
  };
}

function publicPrincipal(principal) {
  return {
    id: principal.userId,
    username: principal.username,
    displayName: principal.displayName,
    permissions: principal.permissions,
    enabled: principal.enabled,
    isRoot: principal.isRoot
  };
}

function hasPermission(session, permission) {
  return Boolean(session?.isRoot || session?.permissions?.includes(permission));
}

function requirePermission(session, res, permission) {
  if (hasPermission(session, permission)) return true;
  json(res, 403, { ok: false, message: "当前账号没有此操作权限" }, securityHeaders());
  return false;
}

function sessionStamp(principal) {
  if (principal?.isRoot) {
    return createHash("sha256")
      .update(`root:${ADMIN_USERNAME}:${ADMIN_PASSWORD}`)
      .digest("hex")
      .slice(0, 32);
  }
  const admin = adminStore.admins.find((item) => item.id === principal?.userId);
  if (!admin) return "";
  return createHash("sha256")
    .update(`${admin.id}:${admin.passwordHash}:${admin.updatedAt || ""}:${admin.enabled !== false}`)
    .digest("hex")
    .slice(0, 32);
}

function signSessionPayload(payloadText) {
  return createHmac("sha256", SESSION_SECRET).update(payloadText).digest("base64url");
}

function createSessionToken(principal) {
  const issuedAt = Date.now();
  const payload = {
    v: 1,
    userId: principal.userId,
    isRoot: Boolean(principal.isRoot),
    issuedAt,
    expiresAt: issuedAt + SESSION_TTL,
    stamp: sessionStamp(principal)
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signSessionPayload(encoded)}`;
}

function decodeSessionToken(token) {
  const [encoded, signature] = String(token || "").split(".");
  if (!encoded || !signature) return null;
  const expected = signSessionPayload(encoded);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload?.v !== 1 || !payload.userId || !Number.isFinite(Number(payload.expiresAt))) return null;
    if (Number(payload.expiresAt) <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function sessionCookie(token, maxAgeSeconds = Math.floor(SESSION_TTL / 1000)) {
  const secure = process.env.RENDER || process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `wp_admin_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
}

function clearSessionCookie() {
  const secure = process.env.RENDER || process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `wp_admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

function currentSession(req) {
  const token = parseCookies(req).wp_admin_session;
  const payload = decodeSessionToken(token);
  if (!payload) return null;
  const principal = payload.isRoot ? rootPrincipal() : storedPrincipal(payload.userId);
  if (!principal || !principal.enabled) return null;
  if (!safeEqual(payload.stamp, sessionStamp(principal))) return null;
  return {
    token,
    expiresAt: Number(payload.expiresAt),
    ...principal
  };
}

function requireAdmin(req, res) {
  const session = currentSession(req);
  if (!session) {
    json(res, 401, { ok: false, message: "请先登录后台" }, securityHeaders());
    return null;
  }
  return session;
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return `scrypt$${salt}$${scryptSync(String(password), salt, 64).toString("hex")}`;
}

function verifyPassword(password, storedHash) {
  const [algorithm, salt, expectedHex] = String(storedHash || "").split("$");
  if (algorithm !== "scrypt" || !salt || !/^[0-9a-f]{128}$/i.test(expectedHex || "")) return false;
  const actual = scryptSync(String(password), salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function validateNewPassword(password) {
  const value = String(password || "");
  if (value.length < 8 || value.length > 128) throw new Error("密码长度需为8-128位");
  return value;
}

function validateAccountInput(input, currentId = "") {
  const username = normalizeUsername(input.username);
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error("账号需为3-32位字母、数字、点、横线或下划线");
  const duplicate = username === normalizeUsername(ADMIN_USERNAME)
    || adminStore.admins.some((item) => item.id !== currentId && normalizeUsername(item.username) === username);
  if (duplicate) throw new Error("管理员账号已存在");
  const permissions = cleanPermissions(input.permissions);
  if (!permissions.length) throw new Error("请至少选择一项权限");
  if (permissions.includes("uploads") && !permissions.includes("resources")) {
    throw new Error("上传图片权限需同时勾选资源与链接权限");
  }
  return {
    username,
    displayName: cleanText(input.displayName || username, 40),
    permissions,
    enabled: input.enabled !== false
  };
}

async function saveAdminStore() {
  adminStore.version += 1;
  if (storageMode === "postgres") {
    await persistDatabaseState("admins", adminStore);
    return;
  }
  const temporaryPath = path.join(DATA_DIR, `admins.${randomBytes(5).toString("hex")}.tmp`);
  await writeFile(temporaryPath, JSON.stringify(adminStore, null, 2) + "\n", "utf8");
  await rename(temporaryPath, ADMINS_PATH);
}

function revokeUserSessions() {
  // Stateless signed cookies are automatically invalidated when the account's
  // password, enabled state or updatedAt value changes.
}

function accountList() {
  return [
    { ...publicPrincipal(rootPrincipal()), createdAt: null, updatedAt: null },
    ...adminStore.admins.map((admin) => ({
      id: admin.id,
      username: admin.username,
      displayName: admin.displayName,
      permissions: cleanPermissions(admin.permissions),
      enabled: admin.enabled !== false,
      isRoot: false,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt
    }))
  ];
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
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  // Embedded poster images are intentionally stored in PostgreSQL. Do not
  // truncate these data URLs; truncation produces a broken image after save.
  if (raw.startsWith("data:image/")) {
    const validImage = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(raw);
    return validImage && raw.length <= 2 * 1024 * 1024 ? raw : "";
  }

  const url = raw.slice(0, 2000);
  if (url.startsWith("/") || url.startsWith("./")) return url;
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
  if (extension === "webp") {
    return buffer.length > 12
      && buffer.subarray(0, 4).toString("ascii") === "RIFF"
      && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

function normalizeConfig(input, previous = {}) {
  if (!input || typeof input !== "object") throw new Error("配置内容不正确");
  const settings = {};
  for (const [key, value] of Object.entries(input.settings || {})) {
    const settingKey = cleanText(key, 80);
    const maxLength = settingKey === "qrPromoImage" ? 3 * 1024 * 1024 : 500;
    settings[settingKey] = cleanText(value, maxLength);
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
  const requestedCategoryOrder = [...new Set((Array.isArray(input.categoryOrder) ? input.categoryOrder : [])
    .slice(0, 50)
    .map((item) => cleanText(item, 40))
    .filter(Boolean))];

  const previousResources = new Map(
    (Array.isArray(previous.resources) ? previous.resources : [])
      .map((resource) => [String(resource.id), resource])
  );
  const saveTimestamp = new Date().toISOString();

  const resources = (Array.isArray(input.resources) ? input.resources : []).slice(0, 500).map((resource, index) => {
    const links = {};
    for (const [sourceId, link] of Object.entries(resource.links || {})) {
      if (sourceIds.has(sourceId) && cleanUrl(link)) links[sourceId] = cleanUrl(link);
    }
    const normalizedResource = {
      id: Number.isFinite(Number(resource.id)) ? Number(resource.id) : Date.now() + index,
      title: cleanText(resource.title || `未命名资源${index + 1}`, 160),
      artTitle: cleanText(resource.artTitle || resource.title || "未命名", 60),
      category: cleanText(resource.category || "其他", 40),
      heat: Math.max(0, Math.min(999999, Number(resource.heat) || 0)),
      rating: Math.max(0, Math.min(10, Number(resource.rating) || 0)),
      update: cleanText(resource.update, 80),
      image: cleanUrl(resource.image),
      colors: Array.isArray(resource.colors) && resource.colors.length >= 2
        ? resource.colors.slice(0, 2).map((color) => /^#[0-9a-f]{6}$/i.test(color) ? color : "#26354f")
        : ["#26354f", "#7786a5"],
      links,
      visible: resource.visible !== false
    };

    const previousResource = previousResources.get(String(normalizedResource.id));
    const comparablePrevious = previousResource ? {
      id: previousResource.id,
      title: previousResource.title,
      artTitle: previousResource.artTitle,
      category: previousResource.category,
      heat: previousResource.heat,
      rating: previousResource.rating,
      update: previousResource.update,
      image: previousResource.image,
      colors: previousResource.colors,
      links: previousResource.links,
      visible: previousResource.visible !== false
    } : null;

    const changed = !comparablePrevious
      || JSON.stringify(comparablePrevious) !== JSON.stringify(normalizedResource);

    return {
      ...normalizedResource,
      updatedAt: changed
        ? saveTimestamp
        : cleanText(
            previousResource?.updatedAt
              || previous.meta?.updatedAt
              || saveTimestamp,
            40
          )
    };
  });
  const categoryOrder = [...new Set([
    ...requestedCategoryOrder,
    ...resources.map((resource) => resource.category).filter(Boolean)
  ])].slice(0, 50);

  return {
    meta: {
      version: Number(previous.meta?.version || 0) + 1,
      updatedAt: new Date().toISOString()
    },
    settings,
    theme,
    categoryOrder,
    sources,
    resources
  };
}

async function loadConfig() {
  return structuredClone(configCache);
}

async function saveConfig(nextConfig) {
  const previous = await loadConfig();
  const normalized = normalizeConfig(nextConfig, previous);
  if (storageMode === "postgres") {
    await persistDatabaseState("config", normalized);
    configCache = structuredClone(normalized);
    return structuredClone(normalized);
  }
  const temporaryPath = path.join(DATA_DIR, `config.${randomBytes(5).toString("hex")}.tmp`);
  await copyFile(CONFIG_PATH, BACKUP_PATH);
  await writeFile(temporaryPath, JSON.stringify(normalized, null, 2) + "\n", "utf8");
  await rename(temporaryPath, CONFIG_PATH);
  configCache = structuredClone(normalized);
  return structuredClone(normalized);
}

function mergeAuthorizedConfig(input, current, session) {
  const next = structuredClone(current);
  let changed = false;
  if (hasPermission(session, "content")) {
    next.settings = input.settings;
    changed = true;
  }
  if (hasPermission(session, "appearance")) {
    next.theme = input.theme;
    next.categoryOrder = input.categoryOrder;
    next.sources = input.sources;
    changed = true;
  }
  if (hasPermission(session, "resources")) {
    next.resources = input.resources;
    changed = true;
  }
  if (!changed) throw new Error("当前账号没有内容修改权限");
  return next;
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/config") {
    return json(res, 200, await loadConfig(), securityHeaders());
  }

  if (req.method === "GET" && url.pathname === "/api/storage-status") {
    return json(res, 200, {
      ok: true,
      mode: storageMode,
      persistent: storageMode === "postgres",
      message: storageMode === "postgres" ? "数据库持久化已启用" : "仍在使用临时文件"
    }, securityHeaders());
  }

  if (req.method === "GET" && url.pathname === "/api/auth/status") {
    const session = currentSession(req);
    return json(res, 200, {
      ok: true,
      authenticated: Boolean(session),
      user: session ? publicPrincipal(session) : null
    }, securityHeaders());
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const attempt = loginAttemptState(req);
    if (attempt.count >= LOGIN_LIMIT) {
      return json(res, 429, { ok: false, message: "尝试次数过多，请稍后再试" }, securityHeaders());
    }
    const body = await readJsonBody(req, 64 * 1024);
    const username = normalizeUsername(body.username);
    let principal = null;
    let passwordMatches = false;
    if (safeEqual(username, normalizeUsername(ADMIN_USERNAME))) {
      principal = rootPrincipal();
      passwordMatches = safeEqual(body.password, ADMIN_PASSWORD);
    } else {
      const admin = adminStore.admins.find((item) => normalizeUsername(item.username) === username);
      if (admin) {
        principal = storedPrincipal(admin.id);
        passwordMatches = verifyPassword(body.password, admin.passwordHash);
      } else {
        safeEqual(body.password, "invalid-login-attempt");
      }
    }
    if (!principal || !principal.enabled || !passwordMatches) {
      recordLoginFailure(attempt);
      return json(res, 401, { ok: false, message: "账号或密码错误" }, securityHeaders());
    }
    loginAttempts.delete(attempt.key);
    const token = createSessionToken(principal);
    return json(res, 200, { ok: true, user: publicPrincipal(principal) }, {
      ...securityHeaders(),
      "Set-Cookie": sessionCookie(token)
    });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    return json(res, 200, { ok: true }, {
      ...securityHeaders(),
      "Set-Cookie": clearSessionCookie()
    });
  }

  let adminSession = null;
  if (url.pathname.startsWith("/api/admin/")) {
    adminSession = requireAdmin(req, res);
    if (!adminSession) return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/accounts") {
    if (!requirePermission(adminSession, res, "admins")) return;
    return json(res, 200, { ok: true, accounts: accountList(), permissions: PERMISSIONS }, securityHeaders());
  }

  if (req.method === "POST" && url.pathname === "/api/admin/accounts") {
    if (!requirePermission(adminSession, res, "admins")) return;
    const body = await readJsonBody(req, 128 * 1024);
    let account;
    let passwordHash;
    try {
      account = validateAccountInput(body);
      passwordHash = hashPassword(validateNewPassword(body.password));
    } catch (error) {
      return json(res, 400, { ok: false, message: error.message }, securityHeaders());
    }
    const now = new Date().toISOString();
    adminStore.admins.push({
      id: randomBytes(12).toString("hex"),
      ...account,
      passwordHash,
      createdAt: now,
      updatedAt: now,
      createdBy: adminSession.username
    });
    await saveAdminStore();
    return json(res, 201, { ok: true, accounts: accountList(), message: "管理员账号已添加" }, securityHeaders());
  }

  const accountMatch = url.pathname.match(/^\/api\/admin\/accounts\/([a-f0-9]{24})$/);
  if (accountMatch && req.method === "PUT") {
    if (!requirePermission(adminSession, res, "admins")) return;
    const account = adminStore.admins.find((item) => item.id === accountMatch[1]);
    if (!account) return json(res, 404, { ok: false, message: "管理员账号不存在" }, securityHeaders());
    const body = await readJsonBody(req, 128 * 1024);
    let updates;
    let passwordHash = "";
    try {
      updates = validateAccountInput(body, account.id);
      if (String(body.password || "")) passwordHash = hashPassword(validateNewPassword(body.password));
    } catch (error) {
      return json(res, 400, { ok: false, message: error.message }, securityHeaders());
    }
    Object.assign(account, updates);
    if (passwordHash) account.passwordHash = passwordHash;
    account.updatedAt = new Date().toISOString();
    await saveAdminStore();
    revokeUserSessions(account.id);
    return json(res, 200, { ok: true, accounts: accountList(), message: "管理员账号已更新" }, securityHeaders());
  }

  if (accountMatch && req.method === "DELETE") {
    if (!requirePermission(adminSession, res, "admins")) return;
    const index = adminStore.admins.findIndex((item) => item.id === accountMatch[1]);
    if (index === -1) return json(res, 404, { ok: false, message: "管理员账号不存在" }, securityHeaders());
    const [removed] = adminStore.admins.splice(index, 1);
    await saveAdminStore();
    revokeUserSessions(removed.id);
    return json(res, 200, { ok: true, accounts: accountList(), message: "管理员账号已删除" }, securityHeaders());
  }

  if (req.method === "GET" && url.pathname === "/api/admin/config") {
    return json(res, 200, await loadConfig(), securityHeaders());
  }

  if (req.method === "PUT" && url.pathname === "/api/admin/config") {
    if (!["content", "appearance", "resources"].some((permission) => hasPermission(adminSession, permission))) {
      return json(res, 403, { ok: false, message: "当前账号没有内容修改权限" }, securityHeaders());
    }
    const body = await readJsonBody(req);
    const current = await loadConfig();
    const saved = await saveConfig(mergeAuthorizedConfig(body, current, adminSession));
    return json(res, 200, { ok: true, config: saved, message: "保存成功，前台已更新" }, securityHeaders());
  }

  if (req.method === "POST" && url.pathname === "/api/admin/upload") {
    if (!requirePermission(adminSession, res, "uploads")) return;
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
    const mime = extension === "jpg" ? "jpeg" : extension;
    const embeddedUrl = `data:image/${mime};base64,${buffer.toString("base64")}`;
    return json(res, 200, { ok: true, url: embeddedUrl, embedded: true }, securityHeaders());
  }

  return json(res, 404, { ok: false, message: "接口不存在" }, securityHeaders());
}

async function serveStatic(req, res, url) {
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    res.writeHead(405, { ...securityHeaders(), Allow: 'GET, HEAD' });
    return res.end('Method not allowed');
  }

  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  if (pathname === "/admin" || pathname === "/admin/") pathname = "/admin.html";
  if (pathname === "/search" || pathname === "/search/") pathname = "/search.html";
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
    let content = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();

    // Safely load the configurable expiry notice on the public and admin pages.
    if (["/index.html", "/search.html", "/admin.html"].includes(pathname)) {
      let html = content.toString("utf8");
      const noticeScript = '<script src="/notice-config.js?v=20260719-5"></script>';
      const allLinksScript = '<script src="/all-links-modal.js?v=20260719-1"></script>';
      const disclaimerScript = '<script src="/disclaimer-config.js?v=20260719-1"></script>';
      const qrPromoScript = '<script src="/qr-promo-config.js?v=20260719-1"></script>';
      const recentUpdatesScript = '<script src="/recent-updates-config.js?v=20260719-12"></script>';
      const scripts = [
        !html.includes("/notice-config.js") ? noticeScript : "",
        ["/index.html", "/search.html"].includes(pathname) && !html.includes("/all-links-modal.js")
          ? allLinksScript
          : "",
        ["/index.html", "/search.html", "/admin.html"].includes(pathname) && !html.includes("/disclaimer-config.js")
          ? disclaimerScript
          : "",
        ["/index.html", "/search.html", "/admin.html"].includes(pathname) && !html.includes("/qr-promo-config.js")
          ? qrPromoScript
          : "",
        ["/index.html", "/search.html", "/admin.html"].includes(pathname) && !html.includes("/recent-updates-config.js")
          ? recentUpdatesScript
          : ""
      ].filter(Boolean).join("\n");
      if (scripts) {
        html = /<\/body>/i.test(html)
          ? html.replace(/<\/body>/i, `${scripts}\n</body>`)
          : `${html}\n${scripts}`;
      }
      content = Buffer.from(html, "utf8");
    }

    res.writeHead(200, {
      ...securityHeaders(),
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Content-Length": content.length,
      "Cache-Control": pathname.startsWith("/uploads/") || pathname.startsWith("/assets/")
        ? "public, max-age=86400"
        : "no-cache"
    });
    if (req.method === 'HEAD') return res.end();
    return res.end(content);
  } catch {
    res.writeHead(404, securityHeaders());
    return res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (error) {
    console.error(error);
    if (res.headersSent) return res.end();
    json(res, 500, { ok: false, message: error.message || "服务器内部错误" }, securityHeaders());
  }
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down.`);
  server.close(async () => {
    if (database) await database.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`wp-resource-search running on port ${PORT}; storage=${storageMode}`);
});
