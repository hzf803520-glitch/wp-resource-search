(() => {
  "use strict";

  const BACKUP_KEY = "wp-resource-search:config-backup:v3";
  const LOGIN_KEY = "wp-resource-search:current-login:v1";
  const ACTIVE_PANEL_KEY = "wp-resource-search:active-panel:v1";
  const SCROLL_KEY = "wp-resource-search:admin-scroll:v1";
  const originalFetch = window.fetch.bind(window);
  let restorePromise = null;
  let saveTimer = null;
  let dbPromise = null;

  function requestPath(input) {
    try {
      const raw = typeof input === "string" ? input : input?.url;
      return new URL(raw, window.location.origin).pathname;
    } catch {
      return "";
    }
  }

  function resourceCount(config) {
    return Array.isArray(config?.resources) ? config.resources.length : 0;
  }

  function configTime(config) {
    const value = Date.parse(config?.meta?.updatedAt || "");
    return Number.isFinite(value) ? value : 0;
  }

  function configVersion(config) {
    return Number(config?.meta?.version) || 0;
  }

  function validConfig(config) {
    return Boolean(config && typeof config === "object" && Array.isArray(config.resources));
  }

  function openBackupDb() {
    if (!window.indexedDB) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      const request = indexedDB.open("wp-resource-search-backup", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("configs")) {
          request.result.createObjectStore("configs");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    return dbPromise;
  }

  async function readIndexedBackup() {
    const db = await openBackupDb();
    if (!db) return null;
    return new Promise((resolve) => {
      const transaction = db.transaction("configs", "readonly");
      const request = transaction.objectStore("configs").get("latest");
      request.onsuccess = () => resolve(validConfig(request.result) ? request.result : null);
      request.onerror = () => resolve(null);
    });
  }

  async function writeIndexedBackup(config) {
    const db = await openBackupDb();
    if (!db) return;
    await new Promise((resolve) => {
      const transaction = db.transaction("configs", "readwrite");
      transaction.objectStore("configs").put(config, "latest");
      transaction.oncomplete = resolve;
      transaction.onerror = resolve;
      transaction.onabort = resolve;
    });
  }

  function readLocalBackup() {
    try {
      const parsed = JSON.parse(localStorage.getItem(BACKUP_KEY) || "null");
      return validConfig(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async function readBackup() {
    return (await readIndexedBackup()) || readLocalBackup();
  }

  async function writeBackup(config, force = false) {
    if (!validConfig(config)) return;
    const previous = await readBackup();
    if (!force && previous && resourceCount(previous) > 0 && resourceCount(config) === 0) return;

    await writeIndexedBackup(config);
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(config));
    } catch {
      // IndexedDB remains the primary backup when localStorage is full.
    }
  }

  function shouldRestore(serverConfig, backupConfig) {
    if (!validConfig(backupConfig)) return false;
    if (!validConfig(serverConfig)) return true;

    const serverResources = resourceCount(serverConfig);
    const backupResources = resourceCount(backupConfig);
    if (serverResources === 0 && backupResources > 0) return true;

    const backupIsNewer = configTime(backupConfig) > configTime(serverConfig)
      || configVersion(backupConfig) > configVersion(serverConfig);
    return backupIsNewer && backupResources >= serverResources;
  }

  function jsonResponse(payload, status = 200, statusText = "OK") {
    return new Response(JSON.stringify(payload), {
      status,
      statusText,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }

  async function restoreServer(config) {
    if (restorePromise) return restorePromise;
    restorePromise = originalFetch("/api/admin/config", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config)
    }).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json().catch(() => null);
      if (payload?.config) await writeBackup(payload.config, true);
    }).catch((error) => {
      console.warn("云端配置自动恢复失败", error);
    }).finally(() => {
      restorePromise = null;
    });
    return restorePromise;
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("图片读取失败"));
      image.src = dataUrl;
    });
  }

  async function compressPoster(dataUrl) {
    if (!String(dataUrl || "").startsWith("data:image/")) return dataUrl;

    try {
      const image = await loadImage(dataUrl);
      const originalWidth = image.naturalWidth || image.width;
      const originalHeight = image.naturalHeight || image.height;
      let maxEdge = 480;
      let quality = 0.62;
      let best = dataUrl;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const scale = Math.min(1, maxEdge / Math.max(originalWidth, originalHeight));
        const width = Math.max(1, Math.round(originalWidth * scale));
        const height = Math.max(1, Math.round(originalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: true });
        if (!context) return best;
        context.drawImage(image, 0, 0, width, height);
        const candidate = canvas.toDataURL("image/webp", quality);
        if (candidate.length < best.length) best = candidate;
        if (candidate.length <= 120000) break;
        maxEdge = Math.max(280, Math.round(maxEdge * 0.84));
        quality = Math.max(0.42, quality - 0.06);
      }

      return best;
    } catch (error) {
      console.warn("海报压缩失败，将保留原图", error);
      return dataUrl;
    }
  }

  function readRememberedLogin() {
    try {
      const value = JSON.parse(sessionStorage.getItem(LOGIN_KEY) || "null");
      return value && value.username && value.password ? value : null;
    } catch {
      return null;
    }
  }

  function rememberLogin(body) {
    try {
      const value = typeof body === "string" ? JSON.parse(body) : body;
      if (value?.username && value?.password) {
        sessionStorage.setItem(LOGIN_KEY, JSON.stringify({
          username: String(value.username),
          password: String(value.password)
        }));
      }
    } catch {
      // Ignore malformed login bodies.
    }
  }

  function clearRememberedLogin() {
    try {
      sessionStorage.removeItem(LOGIN_KEY);
      sessionStorage.removeItem(ACTIVE_PANEL_KEY);
      sessionStorage.removeItem(SCROLL_KEY);
    } catch {
      // Storage may be unavailable in private browsing mode.
    }
  }

  async function autoLoginFromCurrentTab() {
    const remembered = readRememberedLogin();
    if (!remembered) return null;
    const response = await originalFetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(remembered)
    }).catch(() => null);
    if (!response?.ok) {
      clearRememberedLogin();
      return null;
    }
    return response.json().catch(() => null);
  }

  window.fetch = async function persistentFetch(input, init = {}) {
    const path = requestPath(input);
    const method = String(init.method || (typeof input !== "string" && input?.method) || "GET").toUpperCase();

    if (path === "/api/admin/upload" && method === "POST") {
      try {
        const body = JSON.parse(String(init.body || "{}"));
        const compressed = await compressPoster(body.dataUrl);
        return jsonResponse({ ok: true, url: compressed, embedded: true });
      } catch (error) {
        return jsonResponse({ ok: false, message: error.message || "图片处理失败" }, 400, "Bad Request");
      }
    }

    const response = await originalFetch(input, init);

    if (path === "/api/auth/login" && method === "POST" && response.ok) {
      rememberLogin(init.body);
    }

    if (path === "/api/auth/logout" && method === "POST") {
      clearRememberedLogin();
    }

    if (path === "/api/auth/status" && method === "GET" && response.ok) {
      const status = await response.clone().json().catch(() => null);
      if (status && !status.authenticated) {
        const login = await autoLoginFromCurrentTab();
        if (login?.ok && login.user) {
          return jsonResponse({ ok: true, authenticated: true, user: login.user });
        }
      }
    }

    if (path === "/api/admin/config" && method === "GET" && response.ok) {
      const serverConfig = await response.clone().json().catch(() => null);
      const backupConfig = await readBackup();
      if (shouldRestore(serverConfig, backupConfig)) {
        queueMicrotask(() => restoreServer(backupConfig));
        return jsonResponse(backupConfig, response.status, response.statusText);
      }
      await writeBackup(serverConfig);
    }

    if (path === "/api/admin/config" && method === "PUT" && response.ok) {
      const payload = await response.clone().json().catch(() => null);
      if (payload?.config) await writeBackup(payload.config, true);
    }

    return response;
  };

  function scheduleAutoSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const button = document.querySelector("#saveButton");
      const status = document.querySelector("#saveStatus");
      const adminView = document.querySelector("#adminView");
      if (!button || !status || !adminView || adminView.hidden || button.hidden || button.disabled) return;
      if (status.textContent.includes("未保存")) button.click();
    }, 900);
  }

  function restoreCurrentAdminPage() {
    const adminView = document.querySelector("#adminView");
    if (!adminView || adminView.hidden) return;

    let panelId = "";
    let scrollTop = 0;
    try {
      panelId = sessionStorage.getItem(ACTIVE_PANEL_KEY) || "";
      scrollTop = Number(sessionStorage.getItem(SCROLL_KEY)) || 0;
    } catch {
      // Ignore storage failures.
    }

    if (panelId) {
      const button = document.querySelector(`[data-panel-target="${CSS.escape(panelId)}"]`);
      if (button && !button.hidden) button.click();
    }

    const content = document.querySelector(".content-area");
    if (content && scrollTop > 0) requestAnimationFrame(() => { content.scrollTop = scrollTop; });
  }

  function startPageMemory() {
    const adminView = document.querySelector("#adminView");
    const content = document.querySelector(".content-area");

    document.addEventListener("click", (event) => {
      const panelButton = event.target.closest("[data-panel-target]");
      if (panelButton) {
        try { sessionStorage.setItem(ACTIVE_PANEL_KEY, panelButton.dataset.panelTarget || ""); } catch {}
      }
    }, true);

    if (content) {
      let scrollTimer = null;
      content.addEventListener("scroll", () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          try { sessionStorage.setItem(SCROLL_KEY, String(content.scrollTop || 0)); } catch {}
        }, 120);
      }, { passive: true });
    }

    if (adminView) {
      const pageObserver = new MutationObserver(() => {
        if (!adminView.hidden) setTimeout(restoreCurrentAdminPage, 0);
      });
      pageObserver.observe(adminView, { attributes: true, attributeFilter: ["hidden"] });
      if (!adminView.hidden) setTimeout(restoreCurrentAdminPage, 0);
    }
  }

  function startAutoSaveObserver() {
    const status = document.querySelector("#saveStatus");
    if (!status) return;

    startPageMemory();

    const observer = new MutationObserver(scheduleAutoSave);
    observer.observe(status, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true
    });

    document.addEventListener("change", scheduleAutoSave, true);
    document.addEventListener("click", (event) => {
      if (event.target.closest("#addResourceButton,#addSourceButton,[data-action^='delete-']")) {
        scheduleAutoSave();
      }
    }, true);
    window.addEventListener("online", scheduleAutoSave);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startAutoSaveObserver, { once: true });
  } else {
    startAutoSaveObserver();
  }
})();
