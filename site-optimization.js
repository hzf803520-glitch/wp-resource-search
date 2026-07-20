(() => {
  "use strict";

  const STYLE_ID = "siteOptimizationStyles";
  const ADMIN_PANEL_ID = "operationsPanel";
  const ADMIN_NAV_ID = "operationsNavButton";
  const NO_RESULT_ID = "siteNoResultCard";
  const SUGGESTION_ID = "siteSearchSuggestions";

  const STATUS_INFO = {
    normal: { label: "链接正常", icon: "●", className: "normal" },
    updating: { label: "持续更新", icon: "↻", className: "updating" },
    broken: { label: "待检查", icon: "!", className: "broken" },
    offline: { label: "暂时下架", icon: "—", className: "offline" }
  };

  let config = null;
  let publicOps = { statuses: {}, settings: {} };
  let suggestionInput = null;
  let suggestionBox = null;
  let publicRenderTimer = null;
  let noResultTimer = null;
  let modalEnhanceTimer = null;
  let adminInstalled = false;
  let adminData = null;
  let toastTimer = null;
  let lastOpenedResourceId = "";
  let recommendationRenderTimer = null;
  let recommendationDirty = false;

  // year-config.js loads before this file. Keeping the existing wrapper in
  // the chain ensures year and recommendation are saved together.
  const previousFetch = window.fetch.bind(window);

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

  function requestPath(input) {
    try {
      const raw = typeof input === "string" ? input : input?.url;
      return new URL(raw, location.origin).pathname;
    } catch {
      return "";
    }
  }

  function requestMethod(input, init) {
    return normalize(
      init?.method || input?.method || "GET"
    ).toUpperCase();
  }

  function unwrapConfig(payload) {
    if (
      payload
      && typeof payload === "object"
      && payload.config
      && typeof payload.config === "object"
    ) {
      return payload.config;
    }

    return payload;
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .site-resource-status {
        display: inline-flex;
        flex: none;
        align-items: center;
        gap: 4px;
        min-height: 18px;
        border-radius: 999px;
        padding: 2px 7px;
        font-size: 9px;
        font-weight: 800;
        line-height: 1.2;
        white-space: nowrap;
      }
      .site-resource-status.normal { color: #1d9d5b; background: #e9f9f0; }
      .site-resource-status.updating { color: #e47b14; background: #fff3e4; }
      .site-resource-status.broken { color: #e14d4d; background: #ffeded; }
      .site-resource-status.offline { color: #78818d; background: #eceff2; }

      .site-search-suggestions {
        position: fixed;
        z-index: 12000;
        display: none;
        overflow: hidden;
        border: 1px solid rgba(126, 137, 151, .16);
        border-radius: 14px;
        background: rgba(255,255,255,.98);
        box-shadow: 0 18px 45px rgba(33, 43, 58, .18);
        backdrop-filter: blur(12px);
      }
      .site-search-suggestions.show { display: block; }
      .site-search-suggestion {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr) auto;
        align-items: center;
        gap: 9px;
        width: 100%;
        min-height: 48px;
        border: 0;
        border-bottom: 1px solid #f0f1f3;
        padding: 7px 11px;
        color: #2c3440;
        background: transparent;
        text-align: left;
        cursor: pointer;
      }
      .site-search-suggestion:last-child { border-bottom: 0; }
      .site-search-suggestion:hover { background: #faf7ff; }
      .site-search-suggestion-index {
        display: grid;
        width: 30px;
        height: 30px;
        place-items: center;
        border-radius: 9px;
        color: #fff;
        background: linear-gradient(145deg, #f252e7, #b85cff);
        font-size: 11px;
        font-weight: 900;
      }
      .site-search-suggestion strong,
      .site-search-suggestion small {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .site-search-suggestion strong { font-size: 13px; }
      .site-search-suggestion small {
        margin-top: 3px;
        color: #939aa5;
        font-size: 10px;
      }
      .site-search-suggestion-arrow { color: #b3bac4; font-size: 18px; }

      #${NO_RESULT_ID} {
        width: min(calc(100% - 30px), 860px);
        box-sizing: border-box;
        margin: 18px auto;
        border: 1px solid rgba(208, 96, 222, .13);
        border-radius: 20px;
        padding: 24px 18px;
        background: linear-gradient(145deg, #fff, #fff9ff);
        box-shadow: 0 12px 30px rgba(49, 57, 72, .08);
        text-align: center;
      }
      #${NO_RESULT_ID} .site-no-result-icon {
        display: grid;
        width: 54px;
        height: 54px;
        margin: 0 auto 12px;
        place-items: center;
        border-radius: 18px;
        color: #fff;
        background: linear-gradient(145deg, #ef54e3, #a964ff);
        font-size: 23px;
        box-shadow: 0 10px 22px rgba(190, 83, 228, .22);
      }
      #${NO_RESULT_ID} h3 { margin: 0; color: #2d3440; font-size: 18px; }
      #${NO_RESULT_ID} p {
        margin: 8px auto 0;
        color: #8a929e;
        font-size: 12px;
        line-height: 1.7;
      }
      #${NO_RESULT_ID} .site-no-result-actions {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 9px;
        width: min(100%, 480px);
        margin: 15px auto 0;
      }
      #${NO_RESULT_ID} input {
        min-width: 0;
        min-height: 43px;
        border: 1px solid #e7e9ed;
        border-radius: 12px;
        outline: 0;
        padding: 0 12px;
        background: #f7f8fa;
        font: inherit;
      }
      #${NO_RESULT_ID} button {
        min-height: 43px;
        border: 0;
        border-radius: 12px;
        padding: 0 16px;
        color: #fff;
        background: linear-gradient(135deg, #ef53e2, #b35cff);
        font: inherit;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
      }
      #${NO_RESULT_ID} .site-request-message {
        min-height: 18px;
        margin-top: 8px;
        color: #35a46a;
        font-size: 11px;
      }

      .site-native-no-result-actions {
        display: flex !important;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        gap: 9px;
        margin-top: 14px;
      }

      .site-inline-request-button {
        min-width: 116px;
        min-height: 38px;
        border: 0;
        border-radius: 999px;
        padding: 0 16px;
        color: #fff;
        background: linear-gradient(135deg, #ef53e2, #b35cff);
        box-shadow: 0 8px 18px rgba(192, 77, 224, .20);
        font: inherit;
        font-size: 11px;
        font-weight: 850;
        cursor: pointer;
        transition: transform .16s ease, box-shadow .16s ease;
      }

      .site-inline-request-button:hover {
        transform: translateY(-1px);
        box-shadow: 0 10px 22px rgba(192, 77, 224, .25);
      }

      .site-inline-request-button:active {
        transform: scale(.98);
      }

      .site-inline-request-button[disabled] {
        color: #248b58;
        background: #eaf8f0;
        box-shadow: none;
        cursor: default;
      }

      .site-inline-request-hint {
        width: 100%;
        margin-top: 7px;
        color: #35a46a;
        font-size: 10px;
        line-height: 1.5;
        text-align: center;
      }

      @media (max-width: 420px) {
        .site-native-no-result-actions {
          gap: 7px;
        }

        .site-inline-request-button {
          min-width: 108px;
          padding: 0 13px;
        }
      }

      .site-feedback-button {
        width: 100%;
        min-height: 38px;
        margin-top: 9px;
        border: 1px solid rgba(225, 77, 77, .18);
        border-radius: 9px;
        color: #d94c4c;
        background: #fff7f7;
        font: inherit;
        font-size: 11px;
        font-weight: 800;
        cursor: pointer;
      }
      .site-feedback-button[disabled] {
        color: #42a66f;
        background: #effaf4;
        cursor: default;
      }

      .site-ops-panel .site-ops-intro {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 18px;
      }
      .site-ops-panel .site-ops-intro h2 { margin: 5px 0 6px; }
      .site-ops-panel .site-ops-intro p { margin: 0; color: #7f8996; }
      .site-ops-refresh {
        min-height: 40px;
        border: 1px solid #e1e5e9;
        border-radius: 11px;
        padding: 0 14px;
        color: #4f5966;
        background: #fff;
        font-weight: 800;
        cursor: pointer;
      }
      .site-ops-summary {
        display: grid;
        grid-template-columns: repeat(4, minmax(0,1fr));
        gap: 10px;
        margin-bottom: 15px;
      }
      .site-ops-summary article {
        border: 1px solid #e9ecef;
        border-radius: 14px;
        padding: 14px;
        background: #fff;
      }
      .site-ops-summary small { color: #8a94a1; }
      .site-ops-summary strong {
        display: block;
        margin-top: 7px;
        color: #27313d;
        font-size: 23px;
      }
      .site-ops-section {
        margin-top: 14px;
        border: 1px solid #e7eaee;
        border-radius: 16px;
        padding: 15px;
        background: #fff;
      }
      .site-ops-section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 11px;
      }
      .site-ops-section-head h3 { margin: 0; font-size: 16px; }
      .site-ops-section-head p { margin: 4px 0 0; color: #9199a4; font-size: 11px; }
      .site-ops-save-statuses {
        min-height: 38px;
        border: 0;
        border-radius: 10px;
        padding: 0 13px;
        color: #fff;
        background: linear-gradient(135deg, #ef55e3, #ae61ff);
        font-weight: 800;
        cursor: pointer;
      }
      .site-ops-table { display: grid; gap: 8px; }
      .site-ops-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 155px auto;
        align-items: center;
        gap: 10px;
        min-height: 50px;
        border-radius: 11px;
        padding: 8px 10px;
        background: #f7f9fa;
      }
      .site-ops-row strong,
      .site-ops-row small {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .site-ops-row small { margin-top: 3px; color: #8d96a2; font-size: 10px; }
      .site-ops-row select {
        min-height: 38px;
        border: 1px solid #dfe4e8;
        border-radius: 9px;
        padding: 0 9px;
        background: #fff;
      }
      .site-ops-row button {
        min-height: 34px;
        border: 0;
        border-radius: 9px;
        padding: 0 11px;
        color: #4d5764;
        background: #e9edf1;
        font-weight: 750;
        cursor: pointer;
      }
      .site-ops-empty {
        border: 1px dashed #dfe4e8;
        border-radius: 12px;
        padding: 22px 12px;
        color: #929aa5;
        text-align: center;
      }
      .site-ops-ranking {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .site-ops-rank-list { display: grid; gap: 7px; }
      .site-ops-rank-item {
        display: grid;
        grid-template-columns: 28px minmax(0,1fr) auto;
        align-items: center;
        gap: 8px;
        min-height: 39px;
        border-radius: 10px;
        padding: 5px 8px;
        background: #f7f9fa;
      }
      .site-ops-rank-number {
        display: grid;
        width: 26px;
        height: 26px;
        place-items: center;
        border-radius: 8px;
        color: #fff;
        background: #ff765f;
        font-size: 10px;
        font-weight: 900;
      }
      .site-ops-rank-item strong {
        overflow: hidden;
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .site-ops-rank-item span:last-child { color: #8b94a0; font-size: 11px; }
      .site-ops-toast {
        position: fixed;
        z-index: 20000;
        left: 50%;
        bottom: 28px;
        transform: translate(-50%, 15px);
        opacity: 0;
        border-radius: 999px;
        padding: 10px 16px;
        color: #fff;
        background: rgba(28,34,44,.94);
        font-size: 12px;
        pointer-events: none;
        transition: .2s ease;
      }
      .site-ops-toast.show { opacity: 1; transform: translate(-50%, 0); }

      @media (max-width: 760px) {
        #${NO_RESULT_ID} .site-no-result-actions { grid-template-columns: 1fr; }
        .site-ops-summary { grid-template-columns: 1fr 1fr; }
        .site-ops-row { grid-template-columns: minmax(0, 1fr); }
        .site-ops-ranking { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function recommendationSelections() {
    const byId = new Map();
    const byIndex = new Map();

    document.querySelectorAll(
      "[data-resource-recommended-source]"
    ).forEach((select) => {
      const resourceId = normalize(
        select.dataset.resourceRecommendedSource
      );
      const index = Number(select.dataset.resourceIndex);
      const value = normalize(select.value);

      if (resourceId) byId.set(resourceId, value);
      if (Number.isInteger(index) && index >= 0) {
        byIndex.set(index, value);
      }
    });

    return { byId, byIndex };
  }

  function addRecommendationsToPayload(payload) {
    if (!payload || !Array.isArray(payload.resources)) {
      return payload;
    }

    const selections = recommendationSelections();

    payload.resources = payload.resources.map((resource, index) => {
      const resourceId = String(resource.id ?? "");

      const selected = resourceId && selections.byId.has(resourceId)
        ? selections.byId.get(resourceId)
        : selections.byIndex.has(index)
          ? selections.byIndex.get(index)
          : normalize(resource.recommendedSourceId);

      return {
        ...resource,
        recommendedSourceId: selected || ""
      };
    });

    return payload;
  }

  window.fetch = async function recommendationAwareFetch(
    input,
    init = {}
  ) {
    const path = requestPath(input);
    const method = requestMethod(input, init);
    let nextInit = init;

    if (
      location.pathname.startsWith("/admin")
      && path === "/api/admin/config"
      && method === "PUT"
      && typeof init?.body === "string"
    ) {
      try {
        const payload = addRecommendationsToPayload(
          JSON.parse(init.body)
        );

        nextInit = {
          ...init,
          body: JSON.stringify(payload)
        };
      } catch {
        // Keep the original request if another module sends non-JSON data.
      }
    }

    const response = await previousFetch(input, nextInit);

    if (
      response.ok
      && ["/api/config", "/api/admin/config"].includes(path)
      && ["GET", "PUT"].includes(method)
    ) {
      response.clone().json().then((payload) => {
        const nextConfig = unwrapConfig(payload);

        if (
          nextConfig
          && Array.isArray(nextConfig.resources)
        ) {
          config = nextConfig;

          if (method === "PUT") {
            recommendationDirty = false;
          }

          scheduleRecommendationFields();
        }
      }).catch(() => {});
    }

    return response;
  };

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "请求失败");
    return payload;
  }

  function sendEvent(type, details = {}) {
    fetch("/api/site-ops/event", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ...details })
    }).catch(() => {});
  }

  function resources() {
    return Array.isArray(config?.resources) ? config.resources : [];
  }

  function sameId(left, right) {
    return String(left) === String(right);
  }

  function cardForTarget(target) {
    if (!target) return null;

    return target.closest(
      "button[data-resource-id],article[data-resource-id],li[data-resource-id],"
      + ".resource-card,.resource-item,.recent-update-item,.search-result-item,"
      + "button,article,li"
    ) || target;
  }

  function statusCode(entry) {
    if (typeof entry === "string") return normalize(entry);
    return normalize(entry?.status);
  }

  function resourceById(resourceId) {
    if (!resourceId) return null;

    return resources().find(
      (resource) => String(resource.id) === String(resourceId)
    ) || null;
  }

  function exactResourceTitleElements(resource) {
    const wanted = normalize(resource?.title);
    if (!wanted) return [];

    return [
      ...document.querySelectorAll("h1,h2,h3,h4,strong,b,p,span,div")
    ].filter((element) => {
      if (element.closest("#adminView")) return false;
      if (element.closest("#allCloudLinksModal")) return false;
      if (element.closest("#qrPromoModal")) return false;
      if (element.closest("[class*='poster'],[class*='cover'],[class*='image'],figure")) {
        return false;
      }

      const value = normalize(element.textContent);
      if (value !== wanted) return false;

      return ![...element.children].some(
        (child) => normalize(child.textContent) === wanted
      );
    });
  }

  function canonicalStatusEntries() {
    const entries = [];
    const seenPairs = new Set();

    function addEntry(card, resource) {
      if (!card || !card.parentElement || !resource) return;
      if (card.closest("#adminView")) return;
      if (card.closest("#allCloudLinksModal")) return;
      if (card.closest("#qrPromoModal")) return;

      const key = `${String(resource.id)}::${entries.length}`;

      const duplicate = entries.some((entry) => (
        String(entry.resource.id) === String(resource.id)
        && entry.card === card
      ));

      if (duplicate) return;

      seenPairs.add(key);
      entries.push({ card, resource });
    }

    // Strong match: every visible card that carries a resource ID.
    document.querySelectorAll("[data-resource-id]").forEach((target) => {
      const resourceId = normalize(target.dataset.resourceId);
      const resource = resourceById(resourceId);
      if (!resource) return;

      addEntry(cardForTarget(target), resource);
    });

    // Fallback: all title occurrences, so the same resource can display a
    // status in hot resources, recent updates, search results and categories.
    resources().forEach((resource) => {
      exactResourceTitleElements(resource).forEach((titleElement) => {
        addEntry(cardForTarget(titleElement), resource);
      });
    });

    return entries;
  }

  function smallestLeafContaining(card, pattern) {
    return [...card.querySelectorAll("span,small,em,strong,p,div")]
      .filter((element) => pattern.test(normalize(element.textContent)))
      .filter((element) => ![...element.children].some(
        (child) => pattern.test(normalize(child.textContent))
      ))
      .sort((left, right) => (
        normalize(left.textContent).length - normalize(right.textContent).length
      ))[0] || null;
  }

  function statusMetadataLeaf(card) {
    const candidates = [
      smallestLeafContaining(card, /🔥/),
      smallestLeafContaining(card, /⭐|★/),
      smallestLeafContaining(
        card,
        /百度网盘|夸克网盘|UC网盘|迅雷网盘/
      ),
      smallestLeafContaining(
        card,
        /电影|短剧|动漫|影视|小说|学习资料/
      )
    ].filter(Boolean);

    return candidates.find((element) => (
      !element.closest(
        "[class*='poster'],[class*='cover'],[class*='image'],figure"
      )
    )) || null;
  }

  function statusSlot(card, resource) {
    const resourceId = String(resource.id);
    let slot = card.querySelector(
      `[data-site-status-slot="${resourceId}"]`
    );

    const leaf = statusMetadataLeaf(card);
    if (!leaf?.parentElement) {
      slot?.remove();
      return null;
    }

    if (!slot) {
      slot = document.createElement("span");
      slot.className = "site-status-inline-slot";
      slot.dataset.siteStatusSlot = resourceId;
    }

    if (slot.previousElementSibling !== leaf) {
      leaf.insertAdjacentElement("afterend", slot);
    }

    return slot;
  }

  function ensureStatusBadge(card, resource, info) {
    const resourceId = String(resource.id);
    const existing = [
      ...card.querySelectorAll(
        `[data-site-resource-status][data-site-resource-id="${resourceId}"]`
      )
    ];

    let badge = existing.shift() || null;
    existing.forEach((duplicate) => duplicate.remove());

    if (!info) {
      badge?.remove();
      card.querySelector(
        `[data-site-status-slot="${resourceId}"]`
      )?.remove();
      return null;
    }

    const slot = statusSlot(card, resource);
    if (!slot) {
      badge?.remove();
      return null;
    }

    if (!badge) {
      badge = document.createElement("span");
      badge.dataset.siteResourceStatus = "true";
      badge.dataset.siteResourceId = resourceId;
    }

    if (badge.parentElement !== slot) {
      slot.appendChild(badge);
    }

    badge.className = `site-resource-status ${info.className}`;
    badge.textContent = `${info.icon} ${info.label}`;
    badge.title = `资源状态：${info.label}`;
    return badge;
  }

  function applyStatusBadges() {
    document.querySelectorAll(".site-status-meta-host").forEach(
      (element) => element.classList.remove("site-status-meta-host")
    );

    const statuses = publicOps?.statuses || {};
    const entries = canonicalStatusEntries();
    const validBadges = new Set();

    entries.forEach(({ card, resource }) => {
      const code = statusCode(
        statuses[String(resource.id)]
        || statuses[resource.id]
        || resource.siteStatus
      );

      const info = STATUS_INFO[code];
      const badge = ensureStatusBadge(card, resource, info);

      if (badge) validBadges.add(badge);
    });

    document.querySelectorAll("[data-site-resource-status]").forEach((badge) => {
      if (!validBadges.has(badge)) {
        const parent = badge.parentElement;
        badge.remove();

        if (
          parent
          && !parent.querySelector("[data-site-resource-status]")
        ) {
          parent.classList.remove("site-status-card-anchor");
        }
      }
    });
  }

  async function refreshPublicStatuses() {
    const [configResult, opsResult] = await Promise.allSettled([
      fetchJson(`/api/config?_=${Date.now()}`),
      fetchJson(`/api/site-ops/public?_=${Date.now()}`)
    ]);

    if (
      configResult.status === "fulfilled"
      && configResult.value
      && Array.isArray(configResult.value.resources)
    ) {
      config = configResult.value;
    }

    if (
      opsResult.status === "fulfilled"
      && opsResult.value
      && typeof opsResult.value === "object"
    ) {
      publicOps = opsResult.value;
    }

    applyStatusBadges();
  }

  function schedulePublicRender() {
    clearTimeout(publicRenderTimer);
    publicRenderTimer = setTimeout(() => {
      applyStatusBadges();
      enhanceResourceCards();
      installHomeValueStrip();
      enhanceLinksModal();

      const keyword = currentSearchKeyword();
      if (keyword) {
        showNoResultCard(keyword);
      }
    }, 100);
  }

  function scoreTitle(title, keyword) {
    const text = normalize(title).toLowerCase();
    const query = normalize(keyword).toLowerCase();
    if (!query) return 0;
    if (text === query) return 1000;
    if (text.startsWith(query)) return 800 - text.length;
    if (text.includes(query)) return 600 - text.indexOf(query);

    let score = 0;
    for (const character of [...new Set(query)]) {
      if (text.includes(character)) score += 12;
    }
    return score;
  }

  function suggestionItems(keyword) {
    return resources()
      .filter((resource) => resource?.visible !== false)
      .map((resource) => ({
        resource,
        score: scoreTitle(resource.title, keyword)
      }))
      .filter((item) => item.score > 10)
      .sort((left, right) => right.score - left.score)
      .slice(0, 6)
      .map(({ resource }) => resource);
  }

  function positionSuggestionBox() {
    if (!suggestionInput || !suggestionBox) return;
    const rect = suggestionInput.getBoundingClientRect();
    suggestionBox.style.left = `${Math.max(8, rect.left)}px`;
    suggestionBox.style.top = `${rect.bottom + 7}px`;
    suggestionBox.style.width = `${Math.min(rect.width, window.innerWidth - 16)}px`;
  }

  function closeSuggestions() {
    suggestionBox?.classList.remove("show");
  }

  function triggerNativeSearch(input) {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    const scope = input.closest("form,section,header,div") || document;
    const searchButton = [...scope.querySelectorAll("button,a")].find(
      (button) => normalize(button.textContent) === "搜索"
    ) || [...document.querySelectorAll("button,a")].find(
      (button) => normalize(button.textContent) === "搜索"
    );

    if (searchButton) searchButton.click();
    else if (input.form?.requestSubmit) input.form.requestSubmit();
    else input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  }

  function renderSuggestions(keyword) {
    if (!suggestionBox) return;
    const items = suggestionItems(keyword);

    if (!normalize(keyword) || !items.length) {
      closeSuggestions();
      return;
    }

    suggestionBox.innerHTML = items.map((resource, index) => `
      <button class="site-search-suggestion" type="button"
        data-site-suggestion="${escapeHtml(resource.title)}">
        <span class="site-search-suggestion-index">${index + 1}</span>
        <span>
          <strong>${escapeHtml(resource.title)}</strong>
          <small>${escapeHtml(resource.category || "未分类")} · ${escapeHtml(resource.update || "资源")}</small>
        </span>
        <span class="site-search-suggestion-arrow">›</span>
      </button>
    `).join("");

    positionSuggestionBox();
    suggestionBox.classList.add("show");
  }

  function installSearchSuggestions() {
    const input = [...document.querySelectorAll("input[type='search'],input")].find((element) => (
      /搜索|片名|关键词|主演|资源名称/.test(element.placeholder || "")
      && !element.closest("#adminView")
    ));

    if (!input || input.dataset.siteSuggestionsInstalled === "true") return;
    input.dataset.siteSuggestionsInstalled = "true";
    suggestionInput = input;

    suggestionBox = document.getElementById(SUGGESTION_ID) || document.createElement("div");
    suggestionBox.id = SUGGESTION_ID;
    suggestionBox.className = "site-search-suggestions";
    document.body.appendChild(suggestionBox);

    input.addEventListener("input", () => renderSuggestions(input.value));
    input.addEventListener("focus", () => renderSuggestions(input.value));
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      closeSuggestions();
      handleSearchSubmitted(input.value);
    });

    suggestionBox.addEventListener("click", (event) => {
      const button = event.target.closest("[data-site-suggestion]");
      if (!button) return;
      input.value = button.dataset.siteSuggestion || "";
      closeSuggestions();
      handleSearchSubmitted(input.value);
      triggerNativeSearch(input);
    });

    document.addEventListener("click", (event) => {
      if (event.target === input || event.target.closest(`#${SUGGESTION_ID}`)) return;
      closeSuggestions();
    });

    window.addEventListener("resize", positionSuggestionBox);
    window.addEventListener("scroll", positionSuggestionBox, { passive: true });

    document.addEventListener("click", (event) => {
      const button = event.target.closest("button,a");
      if (!button || normalize(button.textContent) !== "搜索") return;
      handleSearchSubmitted(input.value);
    });
  }

  function visibleResourceCount() {
    const cards = new Set();
    document.querySelectorAll("[data-resource-id]").forEach((target) => {
      const card = cardForTarget(target);
      if (!card) return;
      const style = getComputedStyle(card);
      const rect = card.getBoundingClientRect();
      if (style.display !== "none" && style.visibility !== "hidden" && rect.height > 0) {
        cards.add(card);
      }
    });
    return cards.size;
  }

  function currentSearchKeyword(fallback = "") {
    const inputValue = normalize(suggestionInput?.value);
    if (inputValue) return inputValue;

    const params = new URLSearchParams(location.search);
    const queryValue = normalize(
      params.get("q")
      || params.get("keyword")
      || params.get("search")
      || params.get("query")
    );

    return queryValue || normalize(fallback);
  }

  function removeNoResultCard() {
    document.getElementById(NO_RESULT_ID)?.remove();

    document.querySelectorAll("[data-site-inline-request]").forEach((button) => {
      const wrapper = button.closest("[data-site-inline-request-wrapper]");
      const clearButton = wrapper?.querySelector("[data-site-original-clear]");

      if (wrapper && clearButton) {
        clearButton.removeAttribute("data-site-original-clear");
        wrapper.parentNode?.insertBefore(clearButton, wrapper);
        wrapper.remove();
      } else {
        button.remove();
      }
    });
  }

  function nativeNoResultTitle() {
    const candidates = [
      ...document.querySelectorAll("h1,h2,h3,h4,strong,p,div")
    ].filter((element) => {
      if (element.closest("#adminView")) return false;

      const value = normalize(element.textContent);
      if (value !== "没有找到相关资源") return false;

      return ![...element.children].some(
        (child) => normalize(child.textContent) === "没有找到相关资源"
      );
    });

    return candidates[0] || null;
  }

  function nativeNoResultCard() {
    const title = nativeNoResultTitle();
    if (!title) return null;

    let node = title.parentElement;

    while (node && node !== document.body) {
      const clearButton = [...node.querySelectorAll("button,a,[role='button']")]
        .find((button) => /清除筛选|清空筛选/.test(normalize(button.textContent)));

      if (clearButton) {
        return { card: node, title, clearButton };
      }

      node = node.parentElement;
    }

    return {
      card: title.closest("section,article,div") || title.parentElement,
      title,
      clearButton: null
    };
  }

  function submittedRequestKey(keyword) {
    return `site-resource-request:${normalize(keyword).toLowerCase()}`;
  }

  function wasSubmitted(keyword) {
    try {
      return sessionStorage.getItem(submittedRequestKey(keyword)) === "1";
    } catch {
      return false;
    }
  }

  function rememberSubmitted(keyword) {
    try {
      sessionStorage.setItem(submittedRequestKey(keyword), "1");
    } catch {
      // Session storage is optional.
    }
  }

  async function submitInlineResourceRequest(button, keyword, hint) {
    if (!keyword || button.disabled) return;

    button.disabled = true;
    button.textContent = "正在提交…";
    if (hint) hint.textContent = "";

    try {
      const payload = await fetchJson("/api/site-ops/request", {
        method: "POST",
        body: JSON.stringify({ keyword })
      });

      rememberSubmitted(keyword);
      button.textContent = "✓ 已提交";
      button.title = payload.message || "后台已收到资源需求";

      if (hint) {
        hint.textContent = "后台已收到该资源需求";
        hint.style.color = "#35a46a";
      }
    } catch (error) {
      button.disabled = false;
      button.textContent = "重新提交";

      if (hint) {
        hint.textContent = error.message || "提交失败，请稍后重试";
        hint.style.color = "#d84e4e";
      }
    }
  }

  function showNoResultCard(keyword) {
    // Remove the old separate request form if an older script rendered it.
    document.getElementById(NO_RESULT_ID)?.remove();

    const value = currentSearchKeyword(keyword);
    if (!value || visibleResourceCount() > 0) {
      removeNoResultCard();
      return;
    }

    if (publicOps.settings?.requestEnabled === false) return;

    const native = nativeNoResultCard();
    if (!native?.card) return;

    const existing = native.card.querySelector("[data-site-inline-request]");
    if (existing) {
      existing.dataset.requestKeyword = value;
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "site-inline-request-button";
    button.dataset.siteInlineRequest = "true";
    button.dataset.requestKeyword = value;
    button.textContent = wasSubmitted(value)
      ? "✓ 已提交"
      : "提交资源需求";
    button.disabled = wasSubmitted(value);

    const hint = document.createElement("div");
    hint.className = "site-inline-request-hint";
    hint.dataset.siteInlineRequestHint = "true";
    hint.textContent = wasSubmitted(value)
      ? "后台已收到该资源需求"
      : "";

    let actionHost = null;

    if (native.clearButton) {
      const parent = native.clearButton.parentElement;

      if (
        parent
        && parent.children.length <= 3
        && !parent.closest("[data-site-inline-request-wrapper]")
      ) {
        actionHost = parent;
        actionHost.classList.add("site-native-no-result-actions");
      } else {
        actionHost = document.createElement("div");
        actionHost.className = "site-native-no-result-actions";
        actionHost.dataset.siteInlineRequestWrapper = "true";

        native.clearButton.dataset.siteOriginalClear = "true";
        native.clearButton.parentNode?.insertBefore(actionHost, native.clearButton);
        actionHost.appendChild(native.clearButton);
      }
    } else {
      actionHost = document.createElement("div");
      actionHost.className = "site-native-no-result-actions";
      actionHost.dataset.siteInlineRequestWrapper = "true";
      native.card.appendChild(actionHost);
    }

    actionHost.appendChild(button);

    if (actionHost.parentElement) {
      actionHost.insertAdjacentElement("afterend", hint);
    } else {
      native.card.appendChild(hint);
    }

    button.addEventListener("click", () => {
      const requestKeyword = currentSearchKeyword(
        button.dataset.requestKeyword || value
      );

      submitInlineResourceRequest(button, requestKeyword, hint);
    });
  }

  function handleSearchSubmitted(keyword) {
    const value = normalize(keyword);
    if (!value) return;
    sendEvent("search", { key: value });
    clearTimeout(noResultTimer);
    noResultTimer = setTimeout(() => showNoResultCard(value), 650);
  }

  function publicResourceStatus(resource) {
    const code = statusCode(
      publicOps?.statuses?.[String(resource?.id)]
      || publicOps?.statuses?.[resource?.id]
      || resource?.siteStatus
    );

    return STATUS_INFO[code] || null;
  }

  function findCardArrow(card) {
    const explicit = card.querySelector(
      ".recent-update-arrow,[class*='arrow'],[class*='chevron']"
    );

    if (
      explicit
      && !explicit.closest(
        "[class*='poster'],[class*='cover'],[class*='image'],figure"
      )
    ) {
      return explicit;
    }

    return [...card.querySelectorAll("span,small,strong,div")]
      .filter((element) => /^[›>»→❯]$/.test(normalize(element.textContent)))
      .filter((element) => !element.closest(
        "[class*='poster'],[class*='cover'],[class*='image'],figure"
      ))[0] || null;
  }

  function enhanceResourceCards() {
    // Restore the native resource-card layout. The previous CTA enhancement
    // could mistake a section container for a single resource card.
    document.querySelectorAll("[data-site-resource-cta]").forEach(
      (element) => element.remove()
    );

    document.querySelectorAll(".site-conversion-card").forEach(
      (element) => element.classList.remove("site-conversion-card")
    );

    document.querySelectorAll(".site-card-action-host").forEach(
      (element) => element.classList.remove("site-card-action-host")
    );
  }

  function installHomeValueStrip() {
    if (!["/", "/index.html"].includes(location.pathname)) return;
    if (document.getElementById("siteHomeValueStrip")) return;

    const input = suggestionInput || document.querySelector(
      'input[type="search"],input[placeholder*="搜索"]'
    );

    if (!input) return;

    const host = input.closest("form") || input.parentElement;
    if (!host?.parentElement) return;

    const strip = document.createElement("section");
    strip.id = "siteHomeValueStrip";
    strip.className = "site-home-value-strip";
    strip.innerHTML = `
      <div class="site-home-value-main">
        <span class="site-home-value-icon">⚡</span>
        <span>
          <strong>搜到资源，直接打开网盘保存</strong>
          <small>多网盘可选 · 状态可反馈 · 持续维护</small>
        </span>
      </div>
      <div class="site-home-value-points">
        <span>✓ 链接状态清晰</span>
        <span>↗ 一键打开网盘</span>
      </div>
    `;

    host.insertAdjacentElement("afterend", strip);
  }

  function providerLabel(card) {
    return normalize(
      card?.querySelector(".all-links-provider-badge")?.textContent
      || "网盘"
    );
  }

  function resourceRecommendedProviderLabel(resource) {
    const sourceId = normalize(resource?.recommendedSourceId);
    if (!sourceId) return "";

    const source = (
      Array.isArray(config?.sources) ? config.sources : []
    ).find((item) => String(item.id) === sourceId);

    return normalize(source?.label);
  }

  function orderedProviderCards(modal, resource) {
    modal.querySelectorAll("[data-site-other-providers]").forEach(
      (element) => element.remove()
    );

    const cards = [...modal.querySelectorAll(".all-links-card")];

    cards.forEach((card) => {
      card.classList.remove(
        "site-recommended-provider",
        "site-alternative-provider"
      );
      card.querySelector("[data-site-recommended]")?.remove();
    });

    const wantedLabel = resourceRecommendedProviderLabel(resource);

    if (!wantedLabel) {
      return {
        cards,
        recommendationEnabled: false
      };
    }

    const selected = cards.find(
      (card) => providerLabel(card) === wantedLabel
    );

    // A selected source without a valid link does not become recommended.
    if (!selected) {
      return {
        cards,
        recommendationEnabled: false
      };
    }

    if (cards[0] && selected !== cards[0]) {
      cards[0].parentElement?.insertBefore(selected, cards[0]);
    }

    return {
      cards: [...modal.querySelectorAll(".all-links-card")],
      recommendationEnabled: true
    };
  }

  function ensureTransferSummary(modal, resource, cards) {
    const success = modal.querySelector(".all-links-success");
    if (!success) return;

    let summary = modal.querySelector("[data-site-transfer-summary]");

    if (!summary) {
      summary = document.createElement("section");
      summary.className = "site-transfer-summary";
      summary.dataset.siteTransferSummary = "true";
      success.insertAdjacentElement("afterend", summary);
    }

    const status = publicResourceStatus(resource);
    const updateText = normalize(resource?.update);
    const year = Number(resource?.year) || 0;

    const facts = [
      status
        ? `<span class="site-transfer-fact ${escapeHtml(status.className)}">${escapeHtml(status.icon)} ${escapeHtml(status.label)}</span>`
        : "",
      updateText
        ? `<span class="site-transfer-fact">🆕 ${escapeHtml(updateText)}</span>`
        : "",
      year >= 1900
        ? `<span class="site-transfer-fact">📅 ${year}</span>`
        : "",
      `<span class="site-transfer-fact">☁️ ${cards.length}个网盘可选</span>`
    ].filter(Boolean).join("");

    summary.innerHTML = `
      <div class="site-transfer-trust">
        <span class="site-transfer-trust-icon">✓</span>
        <span>
          <strong>资源已匹配</strong>
          <small>选择网盘后，在网盘页面点击保存即可</small>
        </span>
      </div>
      <div class="site-transfer-facts">${facts}</div>
    `;
  }

  function ensureTransferSteps(card) {
    if (card.querySelector("[data-site-transfer-steps]")) return;

    const actions = card.querySelector(".all-links-actions");
    if (!actions) return;

    const steps = document.createElement("div");
    steps.className = "site-transfer-steps";
    steps.dataset.siteTransferSteps = "true";
    steps.innerHTML = `
      <span><b>1</b>打开网盘</span>
      <i>›</i>
      <span><b>2</b>登录账号</span>
      <i>›</i>
      <span><b>3</b>保存资源</span>
    `;

    actions.insertAdjacentElement("afterend", steps);
  }

  function revealAfterOpenPrompt(modal) {
    let panel = modal.querySelector("[data-site-after-open]");

    if (!panel) {
      panel = document.createElement("section");
      panel.className = "site-after-open-panel";
      panel.dataset.siteAfterOpen = "true";
      panel.innerHTML = `
        <span class="site-after-open-icon">🔔</span>
        <span class="site-after-open-copy">
          <strong>已经打开网盘？</strong>
          <small>加入资源群，接收后续更新与失效补链</small>
        </span>
        <button type="button">加入群聊</button>
      `;

      const closeButton = modal.querySelector(".all-links-bottom-close");
      if (closeButton) {
        closeButton.insertAdjacentElement("beforebegin", panel);
      } else {
        modal.querySelector(".all-links-body")?.appendChild(panel);
      }

      panel.querySelector("button")?.addEventListener("click", () => {
        function closeAllResourceOverlays() {
          document.querySelectorAll(
            "#allCloudLinksModal,.all-links-overlay"
          ).forEach((overlay) => {
            overlay.hidden = true;
            overlay.setAttribute("hidden", "");
            overlay.setAttribute("aria-hidden", "true");
            overlay.style.display = "none";
          });

          document.body.classList.remove(
            "all-links-modal-open",
            "site-transfer-modal-open"
          );

          document.documentElement.style.removeProperty("overflow");
          document.body.style.removeProperty("overflow");
        }

        function forceQrModalVisible() {
          const qrModal = document.getElementById("qrPromoModal");
          if (!qrModal) return false;

          const dialog = qrModal.querySelector(".qr-promo-dialog");
          if (!dialog) return false;

          qrModal.hidden = false;
          qrModal.removeAttribute("hidden");
          qrModal.removeAttribute("aria-hidden");
          qrModal.style.removeProperty("display");

          dialog.hidden = false;
          dialog.removeAttribute("hidden");
          dialog.style.removeProperty("display");
          dialog.style.opacity = "1";
          dialog.style.visibility = "visible";
          dialog.style.transform = "none";

          document.body.classList.add("qr-promo-open");
          dialog.querySelector(
            ".qr-promo-close-icon,.qr-promo-close"
          )?.focus();

          return true;
        }

        function openGroupModal() {
          closeAllResourceOverlays();

          const trigger =
            document.getElementById("qrPromoFloatingButton")
            || document.querySelector(".qr-promo-floating");

          if (trigger) {
            trigger.style.removeProperty("opacity");
            trigger.style.removeProperty("visibility");
            trigger.style.removeProperty("pointer-events");
            trigger.click();
          }

          requestAnimationFrame(() => {
            forceQrModalVisible();
          });

          setTimeout(() => {
            if (!forceQrModalVisible() && trigger) {
              trigger.click();
              setTimeout(forceQrModalVisible, 80);
            }
          }, 180);
        }

        closeAllResourceOverlays();

        requestAnimationFrame(() => {
          requestAnimationFrame(openGroupModal);
        });
      });
    }

    panel.classList.add("show");
  }

  function bindTransferOpenAction(link, modal, resource, sourceLabel) {
    if (!link || link.dataset.siteTransferBound === "true") return;

    link.dataset.siteTransferBound = "true";
    link.addEventListener("click", () => {
      sendEvent("source_open", { sourceLabel });
      link.classList.add("opened");
      link.textContent = "已打开网盘，请完成保存";

      setTimeout(() => {
        revealAfterOpenPrompt(modal);
      }, 650);

      setTimeout(() => {
        if (link.isConnected) {
          link.classList.remove("opened");
          link.textContent = link.dataset.siteOriginalText || "立即打开并转存";
        }
      }, 6000);
    });
  }

  function ensureStickyTransferAction(modal, firstCard, resource) {
    if (!firstCard) return;

    const originalOpen = firstCard.querySelector(".all-links-open");
    if (!originalOpen) return;

    let sticky = modal.querySelector("[data-site-transfer-sticky]");

    if (!sticky) {
      sticky = document.createElement("div");
      sticky.className = "site-transfer-sticky";
      sticky.dataset.siteTransferSticky = "true";

      const closeButton = modal.querySelector(".all-links-bottom-close");
      if (closeButton) {
        closeButton.insertAdjacentElement("beforebegin", sticky);
      } else {
        modal.querySelector(".all-links-body")?.appendChild(sticky);
      }
    }

    const label = providerLabel(firstCard);
    sticky.innerHTML = `
      <span>
        <small>推荐使用</small>
        <strong>${escapeHtml(label)}</strong>
      </span>
      <a
        href="${escapeHtml(originalOpen.href)}"
        target="_blank"
        rel="noopener noreferrer"
      >立即打开并转存</a>
    `;

    const stickyLink = sticky.querySelector("a");
    if (stickyLink) {
      stickyLink.dataset.siteOriginalText = "立即打开并转存";
      bindTransferOpenAction(stickyLink, modal, resource, label);
    }
  }

  function resourceFromOpenModal(modal) {
    const modalResourceId = normalize(
      modal.dataset.siteResourceId || lastOpenedResourceId
    );

    if (modalResourceId) {
      const byId = resources().find(
        (resource) => String(resource.id) === modalResourceId
      );

      if (byId) {
        modal.dataset.siteResourceId = String(byId.id);
        return byId;
      }
    }

    const title = normalize(
      modal.querySelector(".all-links-success span")?.textContent
    );

    if (!title) return null;

    const exact = resources().find(
      (resource) => normalize(resource.title) === title
    );

    if (exact) {
      modal.dataset.siteResourceId = String(exact.id);
      return exact;
    }

    const approximate = resources().find((resource) => {
      const resourceTitle = normalize(resource.title);
      return (
        resourceTitle.includes(title)
        || title.includes(resourceTitle)
      );
    }) || null;

    if (approximate) {
      modal.dataset.siteResourceId = String(approximate.id);
    }

    return approximate;
  }

  function enhanceLinksModal() {
    clearTimeout(modalEnhanceTimer);

    modalEnhanceTimer = setTimeout(() => {
      const modal = document.getElementById("allCloudLinksModal");
      if (!modal || modal.hidden) {
        document.body.classList.remove("site-transfer-modal-open");
        return;
      }

      const resource = resourceFromOpenModal(modal);
      if (!resource) return;

      document.body.classList.add("site-transfer-modal-open");
      modal.classList.add("site-transfer-optimized");

      if (modal.dataset.siteTrackedResource !== String(resource.id)) {
        modal.dataset.siteTrackedResource = String(resource.id);
        sendEvent("resource_open", {
          resourceId: String(resource.id),
          title: resource.title
        });
      }

      const {
        cards,
        recommendationEnabled
      } = orderedProviderCards(modal, resource);

      ensureTransferSummary(modal, resource, cards);

      cards.forEach((card, index) => {
        const sourceLabel = providerLabel(card);
        const provider = card.querySelector(".all-links-provider");
        const providerSmall = provider?.querySelector("small");
        const openLink = card.querySelector(".all-links-open");
        const copyButton = card.querySelector(".all-links-copy");

        const isRecommended = recommendationEnabled && index === 0;

        card.classList.toggle(
          "site-recommended-provider",
          isRecommended
        );
        card.classList.toggle(
          "site-alternative-provider",
          !isRecommended
        );

        if (isRecommended) {
          if (!provider?.querySelector("[data-site-recommended]")) {
            const badge = document.createElement("span");
            badge.className = "site-recommended-badge";
            badge.dataset.siteRecommended = "true";
            badge.textContent = "推荐";
            provider?.appendChild(badge);
          }

          if (providerSmall) {
            providerSmall.textContent = "优先使用 · 打开后直接保存";
          }

          if (openLink) {
            openLink.dataset.siteOriginalText = "立即打开并转存";
            if (!openLink.classList.contains("opened")) {
              openLink.textContent = "立即打开并转存";
            }
          }

          if (copyButton && copyButton.dataset.siteCopyEnhanced !== "true") {
            copyButton.dataset.siteCopyEnhanced = "true";
            copyButton.textContent = "复制备用链接";
            copyButton.addEventListener("click", () => {
              const original = copyButton.textContent;
              copyButton.textContent = "✓ 已复制";
              setTimeout(() => {
                if (copyButton.isConnected) {
                  copyButton.textContent = original;
                }
              }, 1800);
            });
          }

          ensureTransferSteps(card);
        } else {
          if (providerSmall) providerSmall.textContent = "其他网盘方式";
          if (openLink) {
            openLink.dataset.siteOriginalText = "打开此网盘";
            if (!openLink.classList.contains("opened")) {
              openLink.textContent = "打开此网盘";
            }
          }
          if (copyButton) copyButton.textContent = "复制链接";
        }

        if (openLink) {
          bindTransferOpenAction(
            openLink,
            modal,
            resource,
            sourceLabel
          );
        }

        if (
          recommendationEnabled
          && index === 1
          && !card.previousElementSibling?.matches(
            "[data-site-other-providers]"
          )
        ) {
          const heading = document.createElement("div");
          heading.className = "site-other-providers-title";
          heading.dataset.siteOtherProviders = "true";
          heading.innerHTML = `
            <span>其他网盘方式</span>
            <small>任选一个可用平台</small>
          `;
          card.insertAdjacentElement("beforebegin", heading);
        }

        if (
          publicOps.settings?.feedbackEnabled !== false
          && !card.querySelector("[data-site-feedback]")
        ) {
          const feedbackButton = document.createElement("button");
          feedbackButton.type = "button";
          feedbackButton.className = "site-feedback-button";
          feedbackButton.dataset.siteFeedback = "true";
          feedbackButton.textContent = "链接打不开？反馈失效";

          feedbackButton.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            feedbackButton.disabled = true;
            feedbackButton.textContent = "正在提交…";

            try {
              await fetchJson("/api/site-ops/feedback", {
                method: "POST",
                body: JSON.stringify({
                  resourceId: String(resource.id),
                  resourceTitle: resource.title,
                  sourceLabel,
                  message: "用户反馈链接失效"
                })
              });
              feedbackButton.textContent = "✓ 已反馈，感谢提醒";
            } catch (error) {
              feedbackButton.disabled = false;
              feedbackButton.textContent =
                error.message || "提交失败，请重试";
            }
          });

          const actions = card.querySelector(".all-links-actions");

          if (actions) {
            const steps = card.querySelector(
              "[data-site-transfer-steps]"
            );

            if (steps) {
              steps.insertAdjacentElement(
                "afterend",
                feedbackButton
              );
            } else {
              actions.insertAdjacentElement(
                "afterend",
                feedbackButton
              );
            }
          } else {
            card.appendChild(feedbackButton);
          }
        }
      });

      if (recommendationEnabled) {
        ensureStickyTransferAction(modal, cards[0], resource);
      } else {
        modal.querySelector("[data-site-transfer-sticky]")?.remove();
      }
    }, 70);
  }

  function installPublicTracking() {
    document.addEventListener("click", (event) => {
      const resourceTarget = event.target.closest("[data-resource-id]");

      if (resourceTarget) {
        lastOpenedResourceId = String(
          resourceTarget.dataset.resourceId || ""
        );

        setTimeout(enhanceLinksModal, 80);
        setTimeout(enhanceLinksModal, 220);
        setTimeout(enhanceLinksModal, 520);
      }

      const modalTrigger = event.target.closest(
        "#allCloudLinksModal button,#allCloudLinksModal a"
      );

      if (modalTrigger) {
        setTimeout(enhanceLinksModal, 40);
      }

      const button = event.target.closest("button,a,[role='button']");
      if (!button) return;
      const text = normalize(button.textContent);

      if (["默认", "最热", "评分", "年份"].includes(text)) {
        sendEvent("sort", { key: text });
        setTimeout(removeNoResultCard, 80);
        setTimeout(schedulePublicRender, 180);
      }

      if (/清除筛选|清空筛选/.test(text)) {
        setTimeout(removeNoResultCard, 30);
      }

      if (button.matches(".qr-promo-floating") || button.closest(".qr-promo-floating")) {
        sendEvent("qr_open");
      }
    });
  }

  function adminResourceCards() {
    const editor = document.getElementById("resourcesEditor");
    if (!editor) return [];

    const direct = [...editor.children].filter(
      (element) => element.nodeType === Node.ELEMENT_NODE
    );

    return direct.length
      ? direct
      : [...editor.querySelectorAll(
          ".resource-editor-card,.resource-editor-item,.editor-section"
        )];
  }

  function adminLabelText(label) {
    return normalize(label?.textContent);
  }

  function adminResourceTitleInput(card) {
    const labels = [...card.querySelectorAll("label")];

    for (const label of labels) {
      if (!/列表完整标题|完整标题|资源标题/.test(
        adminLabelText(label)
      )) {
        continue;
      }

      const input = label.querySelector("input,textarea");
      if (input) return input;
    }

    return card.querySelector(
      "input[data-field='title'],"
      + "input[name*='title'],"
      + "textarea[name*='title']"
    );
  }

  function adminCardResource(card, index) {
    const directId = normalize(
      card.dataset.resourceId
      || card.dataset.yearResourceId
      || card.querySelector("[data-resource-id]")?.dataset.resourceId
    );

    if (directId) {
      const byId = resources().find(
        (resource) => String(resource.id) === directId
      );

      if (byId) return byId;
    }

    const title = normalize(adminResourceTitleInput(card)?.value);
    if (title) {
      const byTitle = resources().find(
        (resource) => normalize(resource.title) === title
      );

      if (byTitle) return byTitle;
    }

    return resources()[index] || null;
  }

  function recommendationOptions(resource) {
    const selected = normalize(resource?.recommendedSourceId);
    const resourceLinks = resource?.links || {};

    const sourceOptions = (
      Array.isArray(config?.sources) ? config.sources : []
    ).map((source) => {
      const sourceId = String(source.id);
      const hasLink = Boolean(normalize(resourceLinks[sourceId]));
      const suffix = hasLink ? "" : "（尚未填写链接）";

      return `
        <option
          value="${escapeHtml(sourceId)}"
          ${selected === sourceId ? "selected" : ""}
        >${escapeHtml(source.label)}${suffix}</option>
      `;
    }).join("");

    return `
      <option value="" ${selected ? "" : "selected"}>
        不设置推荐网盘
      </option>
      ${sourceOptions}
    `;
  }

  function markRecommendationDirty() {
    recommendationDirty = true;

    const status = document.getElementById("saveStatus");
    if (status) status.textContent = "有未保存更改";

    const button =
      document.getElementById("saveButton")
      || [...document.querySelectorAll("button")].find(
        (item) => /保存并发布|保存/.test(
          normalize(item.textContent)
        )
      );

    if (button) {
      button.disabled = false;
      button.classList.add("has-changes");
    }
  }

  function recommendationInsertPoint(card) {
    const headings = [
      ...card.querySelectorAll("h2,h3,h4,strong,div,span")
    ].filter((element) => (
      normalize(element.textContent) === "网盘链接"
      && ![...element.children].some(
        (child) => normalize(child.textContent) === "网盘链接"
      )
    ));

    const heading = headings[0];

    if (heading) {
      const parent = heading.parentElement;
      if (parent && parent !== card) {
        return {
          mode: "after",
          target: heading
        };
      }
    }

    const deleteButton = [...card.querySelectorAll("button")].find(
      (button) => /删除资源/.test(normalize(button.textContent))
    );

    if (deleteButton?.parentElement) {
      return {
        mode: "before",
        target: deleteButton.parentElement
      };
    }

    return {
      mode: "append",
      target: card
    };
  }

  function createRecommendationField(resource, index) {
    const field = document.createElement("label");
    field.className = "resource-recommend-source-field";
    field.dataset.resourceRecommendField = "true";

    field.innerHTML = `
      <span class="resource-recommend-source-copy">
        <strong>推荐网盘</strong>
        <small>仅控制当前资源前台优先展示的平台</small>
      </span>
      <select
        data-resource-recommended-source="${escapeHtml(resource.id)}"
        data-resource-index="${index}"
      >
        ${recommendationOptions(resource)}
      </select>
    `;

    field.querySelector("select")?.addEventListener("change", (event) => {
      resource.recommendedSourceId = normalize(event.currentTarget.value);
      markRecommendationDirty();
    });

    return field;
  }

  function injectRecommendationFields() {
    if (!location.pathname.startsWith("/admin")) return;
    if (!config || !Array.isArray(config.resources)) return;

    // Remove the obsolete global recommendation controls.
    document.querySelectorAll(
      "[data-site-ops-save-recommend],"
      + ".site-ops-recommend-config"
    ).forEach((element) => element.remove());

    adminResourceCards().forEach((card, index) => {
      const resource = adminCardResource(card, index);
      if (!resource) return;

      const existing = card.querySelector(
        "[data-resource-recommend-field]"
      );

      if (existing) {
        const select = existing.querySelector(
          "[data-resource-recommended-source]"
        );

        if (select) {
          select.dataset.resourceRecommendedSource =
            String(resource.id);
          select.dataset.resourceIndex = String(index);

          if (
            document.activeElement !== select
            && !recommendationDirty
          ) {
            select.innerHTML = recommendationOptions(resource);
          }
        }

        return;
      }

      const field = createRecommendationField(resource, index);
      const point = recommendationInsertPoint(card);

      if (point.mode === "after") {
        point.target.insertAdjacentElement("afterend", field);
      } else if (point.mode === "before") {
        point.target.insertAdjacentElement("beforebegin", field);
      } else {
        point.target.appendChild(field);
      }
    });
  }

  function scheduleRecommendationFields() {
    clearTimeout(recommendationRenderTimer);
    recommendationRenderTimer = setTimeout(
      injectRecommendationFields,
      90
    );
  }

  async function loadAdminConfigForRecommendations() {
    try {
      const payload = await fetchJson(
        `/api/admin/config?_=${Date.now()}`
      );

      const nextConfig = unwrapConfig(payload);

      if (
        nextConfig
        && Array.isArray(nextConfig.resources)
      ) {
        config = nextConfig;
        scheduleRecommendationFields();
      }
    } catch {
      // Recommendation is optional; the normal admin remains usable.
    }
  }

  function topEntries(map, limit = 8) {
    return Object.entries(map || {})
      .sort((left, right) => Number(right[1]?.count || 0) - Number(left[1]?.count || 0))
      .slice(0, limit);
  }

  function rankMarkup(entries, emptyText) {
    if (!entries.length) return `<div class="site-ops-empty">${escapeHtml(emptyText)}</div>`;
    return `<div class="site-ops-rank-list">${entries.map(([key, item], index) => `
      <div class="site-ops-rank-item">
        <span class="site-ops-rank-number">${index + 1}</span>
        <strong>${escapeHtml(item?.title || key)}</strong>
        <span>${Number(item?.count || 0)} 次</span>
      </div>
    `).join("")}</div>`;
  }

  function statusOptions(selected) {
    return [
      ["", "不显示状态"],
      ["normal", "🟢 链接正常"],
      ["updating", "🟠 持续更新"],
      ["broken", "🔴 待检查"],
      ["offline", "⚪ 暂时下架"]
    ].map(([value, label]) => (
      `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`
    )).join("");
  }

  function feedbackRows(items) {
    const pending = items.filter((item) => item.status !== "resolved");
    if (!pending.length) return '<div class="site-ops-empty">暂无待处理失效反馈</div>';

    return `<div class="site-ops-table">${pending.map((item) => `
      <div class="site-ops-row">
        <span>
          <strong>${escapeHtml(item.resourceTitle || `资源 ${item.resourceId}`)}</strong>
          <small>${escapeHtml(item.sourceLabel)} · 共 ${Number(item.count || 1)} 次反馈</small>
        </span>
        <span>${escapeHtml(item.message || "链接失效")}</span>
        <button type="button" data-site-ops-resolve="feedback" data-item-id="${escapeHtml(item.id)}">标记已处理</button>
      </div>
    `).join("")}</div>`;
  }

  function requestRows(items) {
    const pending = items.filter((item) => item.status !== "done");
    if (!pending.length) return '<div class="site-ops-empty">暂无待处理资源需求</div>';

    return `<div class="site-ops-table">${pending.map((item) => `
      <div class="site-ops-row">
        <span>
          <strong>${escapeHtml(item.keyword)}</strong>
          <small>用户累计提交 ${Number(item.count || 1)} 次</small>
        </span>
        <span>${escapeHtml((item.updatedAt || "").slice(0, 10))}</span>
        <button type="button" data-site-ops-resolve="request" data-item-id="${escapeHtml(item.id)}">标记已添加</button>
      </div>
    `).join("")}</div>`;
  }

  function renderAdminPanel(payload) {
    adminData = payload;
    const panel = document.getElementById(ADMIN_PANEL_ID);
    if (!panel) return;

    const ops = payload.siteOps || {};
    const resourcesList = Array.isArray(payload.resources) ? payload.resources : [];
    const statuses = ops.statuses || {};
    const feedback = Array.isArray(ops.feedback) ? ops.feedback : [];
    const requests = Array.isArray(ops.requests) ? ops.requests : [];
    const pendingFeedback = feedback.filter((item) => item.status !== "resolved").length;
    const pendingRequests = requests.filter((item) => item.status !== "done").length;

    panel.innerHTML = `
      <div class="site-ops-intro">
        <div>
          <span class="eyebrow">OPERATIONS</span>
          <h2>网站运营中心</h2>
          <p>统一查看资源状态、失效反馈、用户需求和点击数据，不改动原有资源配置。</p>
        </div>
        <button class="site-ops-refresh" type="button" data-site-ops-refresh>刷新数据</button>
      </div>

      <div class="site-ops-summary">
        <article><small>待处理失效反馈</small><strong>${pendingFeedback}</strong></article>
        <article><small>待添加资源需求</small><strong>${pendingRequests}</strong></article>
        <article><small>资源打开次数</small><strong>${topEntries(ops.stats?.resources, 9999).reduce((sum, [, item]) => sum + Number(item.count || 0), 0)}</strong></article>
        <article><small>进群入口点击</small><strong>${Number(ops.stats?.qr?.count || 0)}</strong></article>
      </div>

      <section class="site-ops-section">
        <div class="site-ops-section-head">
          <div><h3>资源有效状态</h3><p>只控制前台状态标签，不会修改资源标题、排序和网盘链接。</p></div>
          <button class="site-ops-save-statuses" type="button" data-site-ops-save-statuses>保存资源状态</button>
        </div>
        <div class="site-ops-table">
          ${resourcesList.map((resource) => `
            <label class="site-ops-row">
              <span>
                <strong>${escapeHtml(resource.title)}</strong>
                <small>${escapeHtml(resource.category || "未分类")} · ID ${escapeHtml(resource.id)}</small>
              </span>
              <select data-site-status-resource="${escapeHtml(resource.id)}">
                ${statusOptions(statuses[String(resource.id)]?.status || "")}
              </select>
              <span></span>
            </label>
          `).join("") || '<div class="site-ops-empty">暂无资源</div>'}
        </div>
      </section>

      <section class="site-ops-section">
        <div class="site-ops-section-head"><div><h3>链接失效反馈</h3><p>用户可在网盘链接弹窗中反馈失效。</p></div></div>
        ${feedbackRows(feedback)}
      </section>

      <section class="site-ops-section">
        <div class="site-ops-section-head"><div><h3>用户资源需求</h3><p>搜索无结果时，用户可以直接提交需求。</p></div></div>
        ${requestRows(requests)}
      </section>

      <section class="site-ops-section">
        <div class="site-ops-section-head"><div><h3>热门数据</h3><p>用于判断应该优先维护哪些资源和关键词。</p></div></div>
        <div class="site-ops-ranking">
          <div><h4>热门搜索</h4>${rankMarkup(topEntries(ops.stats?.searches), "暂无搜索数据")}</div>
          <div><h4>热门资源</h4>${rankMarkup(topEntries(ops.stats?.resources), "暂无资源点击数据")}</div>
        </div>
      </section>
    `;

    bindAdminPanel(panel);
  }

  function showToast(message) {
    let toast = document.querySelector(".site-ops-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "site-ops-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
  }

  async function loadAdminData() {
    const panel = document.getElementById(ADMIN_PANEL_ID);
    if (panel) panel.innerHTML = '<div class="site-ops-empty">正在加载运营数据…</div>';
    try {
      renderAdminPanel(await fetchJson("/api/admin/site-ops"));
    } catch (error) {
      if (panel) panel.innerHTML = `<div class="site-ops-empty">${escapeHtml(error.message)}</div>`;
    }
  }

  function bindAdminPanel(panel) {
    panel.querySelector("[data-site-ops-refresh]")?.addEventListener("click", loadAdminData);

    panel.querySelector("[data-site-ops-save-statuses]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const statuses = {};
      panel.querySelectorAll("[data-site-status-resource]").forEach((select) => {
        if (select.value) statuses[select.dataset.siteStatusResource] = select.value;
      });

      button.disabled = true;
      button.textContent = "正在保存…";
      try {
        const saved = await fetchJson("/api/admin/site-ops/statuses", {
          method: "PUT",
          body: JSON.stringify({ statuses })
        });

        if (adminData?.siteOps) {
          adminData.siteOps.statuses = saved.statuses || {};
        }

        showToast("资源状态已保存，前台刷新后显示");
        button.textContent = "保存成功";
        setTimeout(() => { button.textContent = "保存资源状态"; }, 1200);
      } catch (error) {
        showToast(error.message);
        button.textContent = "重新保存";
      } finally {
        button.disabled = false;
      }
    });

    panel.querySelectorAll("[data-site-ops-resolve]").forEach((button) => {
      button.addEventListener("click", async () => {
        const kind = button.dataset.siteOpsResolve;
        const status = kind === "feedback" ? "resolved" : "done";
        button.disabled = true;
        button.textContent = "处理中…";
        try {
          await fetchJson("/api/admin/site-ops/item", {
            method: "PUT",
            body: JSON.stringify({ kind, id: button.dataset.itemId, status })
          });
          showToast("已更新处理状态");
          await loadAdminData();
        } catch (error) {
          showToast(error.message);
          button.disabled = false;
          button.textContent = "重新处理";
        }
      });
    });
  }

  function openOperationsPanel() {
    document.querySelectorAll(".admin-panel").forEach((panel) => {
      panel.hidden = panel.id !== ADMIN_PANEL_ID;
      panel.classList.toggle("active", panel.id === ADMIN_PANEL_ID);
    });
    document.querySelectorAll(".side-nav button").forEach((button) => {
      button.classList.toggle("active", button.id === ADMIN_NAV_ID);
    });
    const heading = document.getElementById("pageHeading");
    if (heading) heading.textContent = "网站运营中心";
    loadAdminData();
  }

  function installAdminCenter() {
    if (adminInstalled) return;
    const adminView = document.getElementById("adminView");
    const nav = document.querySelector(".side-nav");
    const content = document.querySelector(".content-area");
    if (!adminView || adminView.hidden || !nav || !content) return;

    adminInstalled = true;
    addStyles();

    const navButton = document.createElement("button");
    navButton.id = ADMIN_NAV_ID;
    navButton.type = "button";
    navButton.innerHTML = "<span>◎</span>运营中心";
    navButton.addEventListener("click", openOperationsPanel);
    nav.appendChild(navButton);

    const panel = document.createElement("section");
    panel.id = ADMIN_PANEL_ID;
    panel.className = "admin-panel site-ops-panel";
    panel.hidden = true;
    content.appendChild(panel);

    nav.querySelectorAll("button:not(#operationsNavButton)").forEach((button) => {
      button.addEventListener("click", () => {
        panel.hidden = true;
        panel.classList.remove("active");
      });
    });
  }

  async function initializePublic() {
    addStyles();

    const [configResult, opsResult] = await Promise.allSettled([
      fetchJson(`/api/config?_=${Date.now()}`),
      fetchJson(`/api/site-ops/public?_=${Date.now()}`)
    ]);

    if (
      configResult.status === "fulfilled"
      && configResult.value
      && Array.isArray(configResult.value.resources)
    ) {
      config = configResult.value;
    }

    if (
      opsResult.status === "fulfilled"
      && opsResult.value
      && typeof opsResult.value === "object"
    ) {
      publicOps = opsResult.value;
    }

    // Search/status enhancement requires config, but a temporary operations
    // endpoint failure must not stop the whole public module.
    if (!config || !Array.isArray(config.resources)) return;

    installSearchSuggestions();
    installPublicTracking();
    schedulePublicRender();

    window.addEventListener("pageshow", () => {
      refreshPublicStatuses();
    });

    window.addEventListener("focus", () => {
      refreshPublicStatuses();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        refreshPublicStatuses();
      }
    });

    // Refresh occasionally so a status saved in the admin appears without
    // forcing the user to clear all browser data.
    setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshPublicStatuses();
      }
    }, 60000);

    const observer = new MutationObserver((mutations) => {
      const onlyStatusChanges = mutations.every((mutation) => {
        const target = mutation.target?.nodeType === Node.ELEMENT_NODE
          ? mutation.target
          : mutation.target?.parentElement;

        const addedOnlyStatus = [...mutation.addedNodes].every((node) => (
          node.nodeType !== Node.ELEMENT_NODE
          || node.matches?.("[data-site-resource-status]")
          || node.closest?.("[data-site-resource-status]")
        ));

        const removedOnlyStatus = [...mutation.removedNodes].every((node) => (
          node.nodeType !== Node.ELEMENT_NODE
          || node.matches?.("[data-site-resource-status]")
          || node.closest?.("[data-site-resource-status]")
        ));

        return Boolean(
          target?.closest?.("[data-site-resource-status]")
          || (addedOnlyStatus && removedOnlyStatus)
        );
      });

      if (onlyStatusChanges) return;

      const modalVisibilityChanged = mutations.some((mutation) => (
        mutation.type === "attributes"
        && mutation.target?.id === "allCloudLinksModal"
        && mutation.attributeName === "hidden"
      ));

      schedulePublicRender();

      if (modalVisibilityChanged) {
        const linksModal = document.getElementById(
          "allCloudLinksModal"
        );

        const linksModalOpen = Boolean(
          linksModal && !linksModal.hidden
        );

        document.body.classList.toggle(
          "site-transfer-modal-open",
          linksModalOpen
        );

        if (!linksModalOpen && linksModal) {
          linksModal.style.removeProperty("display");
        }

        setTimeout(enhanceLinksModal, 20);
        setTimeout(enhanceLinksModal, 120);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden"]
    });
  }

  function initializeAdmin() {
    addStyles();
    installAdminCenter();
    loadAdminConfigForRecommendations();

    const observer = new MutationObserver(() => {
      installAdminCenter();
      scheduleRecommendationFields();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden"]
    });
  }

  const start = () => {
    if (location.pathname.startsWith("/admin")) initializeAdmin();
    else initializePublic();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
