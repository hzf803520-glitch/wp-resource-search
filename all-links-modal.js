(() => {
  "use strict";

  const MODAL_ID = "allCloudLinksModal";
  const STYLE_ID = "allCloudLinksModalStyles";
  const DEFAULT_WARNING = "⚠️ 资源10分钟失效，请尽快保存！";
  const DEFAULT_TIP = "🕘 请点击对应网盘按钮复制或打开链接";

  let config = null;
  let loadingPromise = null;
  let toastTimer = null;

  function normalize(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function loadConfig() {
    if (config) return config;
    if (loadingPromise) return loadingPromise;

    loadingPromise = fetch("/api/config", {
      credentials: "same-origin",
      cache: "no-store"
    }).then(async (response) => {
      if (!response.ok) throw new Error("资源配置加载失败");
      config = await response.json();
      return config;
    }).finally(() => {
      loadingPromise = null;
    });

    return loadingPromise;
  }

  function resourceIdFromElement(element) {
    const raw = element?.dataset?.resourceId;
    if (raw == null || raw === "") return null;
    const number = Number(raw);
    return Number.isFinite(number) ? number : raw;
  }

  function sameId(left, right) {
    return String(left) === String(right);
  }

  function sourceMap(currentConfig) {
    return new Map(
      (Array.isArray(currentConfig?.sources) ? currentConfig.sources : [])
        .map((source) => [String(source.id), source])
    );
  }

  function usableLinks(resource, currentConfig) {
    const sources = sourceMap(currentConfig);
    const links = resource?.links && typeof resource.links === "object"
      ? resource.links
      : {};

    return Object.entries(links)
      .map(([sourceId, url], index) => {
        const value = normalize(url);
        if (!value) return null;

        const source = sources.get(String(sourceId));
        return {
          id: String(sourceId),
          label: normalize(source?.label) || `网盘${index + 1}`,
          url: value
        };
      })
      .filter(Boolean);
  }

  function extractionCode(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      const keys = ["pwd", "code", "passcode", "password", "提取码"];
      for (const key of keys) {
        const value = normalize(parsed.searchParams.get(key));
        if (value) return value;
      }
    } catch {
      // Continue with regex matching below.
    }

    const decoded = (() => {
      try {
        return decodeURIComponent(url);
      } catch {
        return url;
      }
    })();

    const match = decoded.match(/(?:提取码|密码|pwd|code|passcode)[=:：\s]+([A-Za-z0-9]{3,12})/i);
    return match ? match[1] : "";
  }

  function providerClass(label) {
    const name = normalize(label).toLowerCase();
    if (name.includes("百度")) return "baidu";
    if (name.includes("夸克")) return "quark";
    if (name.includes("uc")) return "uc";
    if (name.includes("阿里")) return "aliyun";
    if (name.includes("天翼")) return "tianyi";
    if (name.includes("115")) return "one15";
    return "default";
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .all-links-overlay {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: grid;
        place-items: center;
        padding: 18px;
        background: rgba(22, 28, 38, .56);
        backdrop-filter: blur(4px);
      }
      .all-links-overlay[hidden] { display: none !important; }
      .all-links-dialog {
        width: min(100%, 430px);
        max-height: min(88vh, 760px);
        overflow: hidden;
        border-radius: 18px;
        background: #fff;
        box-shadow: 0 24px 70px rgba(20, 28, 42, .24);
        color: #202735;
      }
      .all-links-head {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 36px;
        align-items: start;
        gap: 12px;
        padding: 18px 18px 14px;
        border-bottom: 1px solid #eceef2;
      }
      .all-links-head h2 {
        margin: 0;
        font-size: 18px;
        line-height: 1.35;
      }
      .all-links-head p {
        margin: 6px 0 0;
        color: #8c929d;
        font-size: 12px;
        line-height: 1.5;
      }
      .all-links-close-icon {
        display: grid;
        width: 34px;
        height: 34px;
        place-items: center;
        border: 0;
        border-radius: 50%;
        color: #9298a2;
        background: #f4f5f7;
        font-size: 22px;
        line-height: 1;
        cursor: pointer;
      }
      .all-links-body {
        max-height: calc(min(88vh, 760px) - 86px);
        overflow-y: auto;
        padding: 14px;
      }
      .all-links-success {
        padding: 2px 8px 12px;
        text-align: center;
      }
      .all-links-success strong {
        display: block;
        font-size: 21px;
      }
      .all-links-success span {
        display: block;
        margin-top: 5px;
        color: #777f8b;
        font-size: 13px;
      }
      .all-links-list {
        display: grid;
        gap: 12px;
      }
      .all-links-card {
        border-radius: 13px;
        padding: 13px;
        background: #f5f6f8;
      }
      .all-links-provider {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
      }
      .all-links-provider-badge {
        display: inline-flex;
        align-items: center;
        min-height: 25px;
        border-radius: 999px;
        padding: 4px 11px;
        color: #fff;
        font-size: 12px;
        font-weight: 800;
      }
      .all-links-provider-badge.baidu { background: #3275e8; }
      .all-links-provider-badge.quark { background: #286889; }
      .all-links-provider-badge.uc { background: #d4ad20; }
      .all-links-provider-badge.aliyun { background: #ff713d; }
      .all-links-provider-badge.tianyi { background: #3b82f6; }
      .all-links-provider-badge.one15 { background: #e84c4c; }
      .all-links-provider-badge.default { background: #697586; }
      .all-links-provider small {
        color: #767e8a;
        font-size: 11px;
      }
      .all-links-url {
        min-height: 42px;
        overflow-wrap: anywhere;
        border-radius: 9px;
        padding: 11px 12px;
        color: #ff5656;
        background: #fff;
        box-shadow: 0 1px 3px rgba(32, 39, 53, .06);
        font-size: 12px;
        line-height: 1.55;
      }
      .all-links-code {
        margin-top: 7px;
        color: #616976;
        font-size: 12px;
      }
      .all-links-provider-tip {
        margin: 7px 0 0;
        color: #ff6262;
        font-size: 11px;
      }
      .all-links-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-top: 11px;
      }
      .all-links-actions button,
      .all-links-actions a {
        display: grid;
        min-height: 43px;
        place-items: center;
        border: 0;
        border-radius: 9px;
        padding: 9px 12px;
        font: inherit;
        font-size: 13px;
        font-weight: 800;
        text-decoration: none;
        cursor: pointer;
      }
      .all-links-copy {
        color: #fff;
        background: linear-gradient(135deg, #ff6464, #ff8a56);
        box-shadow: 0 8px 18px rgba(255, 104, 87, .2);
      }
      .all-links-open {
        color: #343a44;
        background: #eceef2;
      }
      .all-links-warning {
        margin-top: 13px;
        border-radius: 8px;
        padding: 10px 12px;
        color: #ff4040;
        background: #fff0f0;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.5;
        text-align: center;
      }
      .all-links-tip {
        margin-top: 8px;
        padding: 0 8px;
        color: #ff8a36;
        font-size: 12px;
        line-height: 1.5;
        text-align: center;
      }
      .all-links-bottom-close {
        width: 100%;
        min-height: 46px;
        margin-top: 14px;
        border: 0;
        border-radius: 10px;
        color: #555d68;
        background: #eef0f3;
        font-size: 14px;
        font-weight: 800;
        cursor: pointer;
      }
      .all-links-empty {
        border-radius: 12px;
        padding: 30px 18px;
        color: #7d8490;
        background: #f5f6f8;
        text-align: center;
      }
      .all-links-toast {
        position: fixed;
        z-index: 10001;
        left: 50%;
        bottom: max(28px, env(safe-area-inset-bottom));
        transform: translate(-50%, 18px);
        opacity: 0;
        border-radius: 999px;
        padding: 10px 16px;
        color: #fff;
        background: rgba(28, 34, 45, .92);
        font-size: 13px;
        pointer-events: none;
        transition: .2s ease;
      }
      .all-links-toast.show {
        transform: translate(-50%, 0);
        opacity: 1;
      }
      body.all-links-modal-open { overflow: hidden; }
      @media (max-width: 420px) {
        .all-links-overlay { padding: 0; align-items: end; }
        .all-links-dialog {
          width: 100%;
          max-height: 92vh;
          border-radius: 20px 20px 0 0;
        }
        .all-links-body {
          max-height: calc(92vh - 86px);
          padding-bottom: calc(16px + env(safe-area-inset-bottom));
        }
      }
    `;
    document.head.appendChild(style);
  }

  function modalElement() {
    let overlay = document.getElementById(MODAL_ID);
    if (overlay) return overlay;

    ensureStyles();
    overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.className = "all-links-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <section class="all-links-dialog" role="dialog" aria-modal="true" aria-labelledby="allLinksModalTitle">
        <header class="all-links-head">
          <div>
            <h2 id="allLinksModalTitle">资源链接</h2>
            <p>全部网盘链接已汇总到当前页面</p>
          </div>
          <button class="all-links-close-icon" type="button" data-all-links-close aria-label="关闭">×</button>
        </header>
        <div class="all-links-body" data-all-links-body></div>
      </section>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest("[data-all-links-close]")) {
        closeModal();
        return;
      }

      const copyButton = event.target.closest("[data-copy-all-link]");
      if (copyButton) {
        copyText(copyButton.dataset.copyAllLink || "");
      }
    });

    return overlay;
  }

  async function copyText(value) {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }

    showToast("链接已复制");
  }

  function showToast(message) {
    let toast = document.querySelector(".all-links-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "all-links-toast";
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1700);
  }

  function linkCardMarkup(link) {
    const code = extractionCode(link.url);
    const label = escapeHtml(link.label);
    const url = escapeHtml(link.url);
    const provider = providerClass(link.label);

    return `
      <article class="all-links-card">
        <div class="all-links-provider">
          <span class="all-links-provider-badge ${provider}">${label}</span>
          <small>资源链接</small>
        </div>
        <div class="all-links-url">${url}</div>
        ${code ? `<div class="all-links-code">提取码：${escapeHtml(code)}</div>` : ""}
        <p class="all-links-provider-tip">复制链接打开${label}转存即可观看</p>
        <div class="all-links-actions">
          <button class="all-links-copy" type="button" data-copy-all-link="${url}">复制链接</button>
          <a class="all-links-open" href="${url}" target="_blank" rel="noopener noreferrer">打开链接</a>
        </div>
      </article>
    `;
  }

  function modalMarkup(resource, links, currentConfig) {
    const warning = normalize(currentConfig?.settings?.resourceExpiryNotice) || DEFAULT_WARNING;
    const tip = normalize(currentConfig?.settings?.resourceActionTip) || DEFAULT_TIP;
    const title = normalize(resource?.title) || "资源";

    return `
      <div class="all-links-success">
        <strong>${escapeHtml(currentConfig?.settings?.modalSuccess || "获取成功!")}</strong>
        <span>${escapeHtml(title)}</span>
      </div>
      ${
        links.length
          ? `<div class="all-links-list">${links.map(linkCardMarkup).join("")}</div>`
          : `<div class="all-links-empty">该资源暂未配置可用网盘链接</div>`
      }
      <div class="all-links-warning">${escapeHtml(warning)}</div>
      <div class="all-links-tip">${escapeHtml(tip)}</div>
      <button class="all-links-bottom-close" type="button" data-all-links-close>关闭</button>
    `;
  }

  async function openResource(resourceId) {
    try {
      const currentConfig = await loadConfig();
      const resource = (Array.isArray(currentConfig?.resources) ? currentConfig.resources : [])
        .find((item) => sameId(item.id, resourceId));

      if (!resource) {
        showToast("没有找到该资源");
        return;
      }

      const links = usableLinks(resource, currentConfig);
      const overlay = modalElement();
      overlay.querySelector("[data-all-links-body]").innerHTML =
        modalMarkup(resource, links, currentConfig);
      overlay.hidden = false;
      document.body.classList.add("all-links-modal-open");

      const closeButton = overlay.querySelector(".all-links-close-icon");
      if (closeButton) closeButton.focus();
    } catch (error) {
      console.error(error);
      showToast(error.message || "资源链接加载失败");
    }
  }

  function closeOriginalModalIfOpen() {
    const candidates = [
      "#resourceModal",
      ".resource-modal",
      ".modal-overlay",
      '[role="dialog"]'
    ];

    for (const selector of candidates) {
      document.querySelectorAll(selector).forEach((element) => {
        if (element.id === MODAL_ID || element.closest(`#${MODAL_ID}`)) return;
        if (element.hidden === false || getComputedStyle(element).display !== "none") {
          element.hidden = true;
        }
      });
    }
  }

  function closeModal() {
    const overlay = document.getElementById(MODAL_ID);
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("all-links-modal-open");
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest(`#${MODAL_ID}`)) return;

    const resourceTarget = event.target.closest("[data-resource-id]");
    if (!resourceTarget) return;

    const resourceId = resourceIdFromElement(resourceTarget);
    if (resourceId == null) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    closeOriginalModalIfOpen();
    openResource(resourceId);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  // Preload the config after the page becomes idle.
  const preload = () => loadConfig().catch(() => {});
  if ("requestIdleCallback" in window) {
    requestIdleCallback(preload, { timeout: 2000 });
  } else {
    setTimeout(preload, 700);
  }
})();
