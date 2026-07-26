import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const sourcePath = path.join(ROOT, "server.mjs");
const runtimePath = path.join(ROOT, ".runtime-server.mjs");

const HELPERS = String.raw`
const RESOURCE_ENRICH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  "Accept-Language": "zh-CN,zh;q=0.9",
  Accept: "application/json"
};

function normalizeEnrichTitle(value) {
  return String(value || "").replace(/[《》\s·.。—_-]/g, "").toLowerCase();
}

function enrichCategory(item) {
  const mediaType = String(item?.movieTypeDesc || "");
  const genres = String(item?.cat || "");
  const duration = Number(item?.dur) || 0;
  if (/动画|动漫/.test(mediaType + " " + genres)) return "动漫";
  if (/综艺/.test(mediaType + " " + genres)) return "综艺";
  if (/纪录/.test(mediaType + " " + genres)) return "纪录片";
  if (/短剧|微短剧/.test(mediaType + " " + genres)) return "短剧";
  if (/电影/.test(mediaType)) return "电影";
  if (/剧/.test(mediaType)) return duration > 0 && duration <= 15 ? "短剧" : "电视剧";
  return "其他";
}

async function enrichResourceFromMaoyan(rawTitle) {
  const title = cleanText(rawTitle, 160);
  if (!title) throw new Error("缺少资源名称");
  const endpoint = "https://m.maoyan.com/ajax/search?kw=" + encodeURIComponent(title) + "&cityId=10&stype=-1";
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: {
      ...RESOURCE_ENRICH_HEADERS,
      Referer: "https://m.maoyan.com/search?kw=" + encodeURIComponent(title)
    }
  });
  if (!response.ok) throw new Error("猫眼搜索失败（" + response.status + "）");
  const payload = await response.json().catch(() => ({}));
  const items = Array.isArray(payload?.movies?.list) ? payload.movies.list : [];
  const target = normalizeEnrichTitle(title);
  const matches = items.filter((item) => {
    return normalizeEnrichTitle(item?.nm) === target || normalizeEnrichTitle(item?.movieAlias) === target;
  });
  matches.sort((left, right) => {
    const leftExact = normalizeEnrichTitle(left?.nm) === target ? 0 : 1;
    const rightExact = normalizeEnrichTitle(right?.nm) === target ? 0 : 1;
    const leftDrama = String(left?.movieTypeDesc || "").includes("剧") ? 0 : 1;
    const rightDrama = String(right?.movieTypeDesc || "").includes("剧") ? 0 : 1;
    return leftExact - rightExact || leftDrama - rightDrama;
  });
  const item = matches.find((candidate) => candidate?.img) || matches[0];
  if (!item) throw new Error("没有找到与《" + title + "》完全匹配的资料");
  return {
    ok: true,
    matchedTitle: cleanText(item.nm || title, 160),
    image: cleanUrl(item.img || ""),
    rating: Math.max(0, Math.min(10, Number(item.sc) || 0)),
    heat: Math.max(0, Math.min(999999, Math.round(Number(item.wish) || 0))),
    category: enrichCategory(item),
    year: (() => {
      const match = String(item.pubDesc || "").match(/(?:19|20)\d{2}/);
      return match ? Number(match[0]) : 0;
    })(),
    note: [item.movieTypeDesc, item.cat, item.pubDesc].filter(Boolean).join(" · ")
  };
}
`;

const ROUTE = String.raw`
  if (req.method === "POST" && url.pathname === "/api/admin/resource-enrich") {
    if (!requirePermission(adminSession, res, "resources")) return;
    const body = await readJsonBody(req, 32 * 1024);
    try {
      const result = await enrichResourceFromMaoyan(body?.title);
      return json(res, 200, result, securityHeaders());
    } catch (error) {
      return json(res, 422, {
        ok: false,
        message: error?.message || "联网补全失败"
      }, securityHeaders());
    }
  }
`;

const helperMarker = "\nasync function handleApi(req, res, url) {";
const authMarker = `  if (url.pathname.startsWith("/api/admin/")) {
    adminSession = requireAdmin(req, res);
    if (!adminSession) return;
  }
`;

let source = await readFile(sourcePath, "utf8");
if (!source.includes(helperMarker)) {
  throw new Error("无法注入资源补全功能：server.mjs 中未找到 handleApi 标记");
}
if (!source.includes(authMarker)) {
  throw new Error("无法注入资源补全接口：server.mjs 中未找到后台认证标记");
}
source = source.replace(helperMarker, `\n${HELPERS}${helperMarker}`);
source = source.replace(authMarker, `${authMarker}${ROUTE}`);
await writeFile(runtimePath, source, "utf8");
await import(`${pathToFileURL(runtimePath).href}?runtime=${Date.now()}`);
