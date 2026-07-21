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
      .site-ops-intro-actions {
        display: flex;
        flex: none;
        align-items: center;
        gap: 8px;
      }
      .site-ops-reset {
        min-height: 40px;
        border: 1px solid rgba(219, 73, 84, .18);
        border-radius: 11px;
        padding: 0 14px;
        color: #d64a54;
        background: #fff0f1;
        font-weight: 800;
        cursor: pointer;
      }
      .site-ops-reset:hover {
        background: #ffe5e7;
      }
      .site-ops-reset:disabled {
        opacity: .58;
        cursor: wait;
      }
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

      @media (max-width: 720px) {
        .site-ops-intro {
          flex-direction: column;
        }
        .site-ops-intro-actions {
          width: 100%;
        }
        .site-ops-intro-actions > button {
          min-width: 0;
          flex: 1;
        }
      }

      [data-site-category-stats] {
        display: flex;
        max-width: 100%;
        align-items: center;
        gap: 5px 10px;
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }

      [data-site-category-stats]::-webkit-scrollbar {
        display: none;
      }

      [data-site-category-stats] > * {
        flex: 0 0 auto;
      }

      [data-site-category-stats] .site-category-count {
        display: inline-grid;
        min-width: 18px;
        height: 18px;
        margin-left: 5px;
        place-items: center;
        border-radius: 999px;
        padding: 0 5px;
        color: #8b55a8;
        background: rgba(230, 83, 241, .10);
        font-size: 9px;
        font-weight: 850;
        line-height: 18px;
        vertical-align: middle;
        pointer-events: none;
      }

      .site-back-to-top {
        position: fixed;
        z-index: 8500;
        right: max(14px, env(safe-area-inset-right));
        bottom: max(82px, calc(env(safe-area-inset-bottom) + 70px));
        display: grid;
        width: 42px;
        height: 42px;
        place-items: center;
        opacity: 0;
        visibility: hidden;
        border: 1px solid rgba(230, 83, 241, .16);
        border-radius: 14px;
        color: #fff;
        background: linear-gradient(145deg, #e653f1, #ad4bea);
        box-shadow: 0 12px 27px rgba(169, 75, 234, .22);
        font-size: 20px;
        font-weight: 900;
        cursor: pointer;
        transform: translateY(12px);
        transition:
          opacity .18s ease,
          visibility .18s ease,
          transform .18s ease;
      }

      .site-back-to-top.show {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }

      body.site-transfer-modal-open .site-back-to-top,
      body.qr-promo-open .site-back-to-top {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      .site-image-fallback {
        object-fit: cover !important;
        background: #f1f3f5;
      }

      @media (max-width: 359px) {
        [data-site-category-stats] .site-category-count {
          min-width: 16px;
          height: 16px;
          margin-left: 3px;
          padding-inline: 4px;
          font-size: 8px;
          line-height: 16px;
        }

        .site-back-to-top {
          right: max(10px, env(safe-area-inset-right));
          width: 38px;
          height: 38px;
          border-radius: 12px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function recommendationSelections() {
    const byId = new Map();
    const byIndex = new Map();
    const statusById = new Map();
    const statusByIndex = new Map();

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

    document.querySelectorAll(
      "[data-resource-status-editor]"
    ).forEach((select) => {
      const resourceId = normalize(
        select.dataset.resourceStatusEditor
      );
      const index = Number(select.dataset.resourceIndex);
      const value = normalize(select.value);

      if (resourceId) statusById.set(resourceId, value);
      if (Number.isInteger(index) && index >= 0) {
        statusByIndex.set(index, value);
      }
    });

    return {
      byId,
      byIndex,
      statusById,
      statusByIndex
    };
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

      const selectedStatus =
        resourceId && selections.statusById.has(resourceId)
          ? selections.statusById.get(resourceId)
          : selections.statusByIndex.has(index)
            ? selections.statusByIndex.get(index)
            : normalize(resource.siteStatus);

      return {
        ...resource,
        recommendedSourceId: selected || "",
        siteStatus: selectedStatus || ""
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

  function categoryCountMap() {
    const counts = new Map();

    resources()
      .filter((resource) => resource?.visible !== false)
      .forEach((resource) => {
        const category = normalize(resource.category);
        if (!category) return;
        counts.set(category, (counts.get(category) || 0) + 1);
      });

    return counts;
  }

  function categoryLabels() {
    const configured = Array.isArray(config?.categories)
      ? config.categories
          .map((category) => normalize(category?.label || category))
          .filter(Boolean)
      : [];

    return [...new Set([
      ...configured,
      ...categoryCountMap().keys()
    ])];
  }

  function isHomePage() {
    return ["/", "/index.html"].includes(location.pathname);
  }

  function directCategoryLabel(element, labels) {
    const clone = element.cloneNode(true);

    clone.querySelectorAll(
      "[data-site-category-count]"
    ).forEach((badge) => badge.remove());

    const text = normalize(clone.textContent)
      .replace(/\s+\d+\s*$/, "")
      .trim();

    return labels.find((label) => text === label) || "";
  }

  function homepageStatsCandidate(labels) {
    if (!isHomePage()) return null;

    const excluded =
      /全部分类|全部网盘|默认|最热|评分|年份|热门资源|最近更新/;

    const candidates = [
      ...document.querySelectorAll("nav,section,ul,div")
    ].map((container) => {
      if (container.closest("#adminView")) return null;
      if (container.closest("#allCloudLinksModal")) return null;
      if (container.closest("#qrPromoModal")) return null;
      if (container.querySelector("[data-resource-id]")) return null;
      if (excluded.test(normalize(container.textContent))) return null;

      const children = [...container.children].filter((child) => {
        if (child.hidden) return false;
        const style = getComputedStyle(child);
        return style.display !== "none";
      });

      if (children.length < 3 || children.length > 12) return null;

      const matches = children
        .map((child) => ({
          child,
          label: directCategoryLabel(child, labels)
        }))
        .filter((entry) => entry.label);

      if (matches.length < 3) return null;
      if (matches.length / children.length < 0.55) return null;

      const rect = container.getBoundingClientRect();
      if (rect.width < 180 || rect.height > 150) return null;

      return {
        container,
        matches,
        score:
          matches.length * 100
          - children.length * 3
          - Math.round(rect.height)
      };
    }).filter(Boolean);

    candidates.sort((left, right) => right.score - left.score);
    return candidates[0] || null;
  }

  function removeLegacyCategoryNumbers(item, label) {
    item.querySelectorAll(
      ":scope > [data-site-category-count]"
    ).forEach((badge, index) => {
      if (index > 0) badge.remove();
    });

    // Remove old hard-coded numeric child elements.
    [...item.children].forEach((child) => {
      if (
        !child.matches("[data-site-category-count]")
        && /^\d+$/.test(normalize(child.textContent))
        && child.children.length === 0
      ) {
        child.remove();
      }
    });

    // Remove a trailing fixed number from a simple text node such as “电影 8”.
    [...item.childNodes].forEach((node) => {
      if (node.nodeType !== Node.TEXT_NODE) return;

      const value = node.textContent || "";
      const cleaned = value.replace(/\s+\d+\s*$/, "");

      if (
        cleaned !== value
        && normalize(item.textContent).startsWith(label)
      ) {
        node.textContent = cleaned;
      }
    });
  }

  function updateCategoryCounts() {
    // First remove badges accidentally inserted by an older version.
    if (!isHomePage()) {
      document.querySelectorAll(
        "[data-site-category-count]"
      ).forEach((badge) => badge.remove());

      document.querySelectorAll(
        "[data-site-category-stats]"
      ).forEach((container) => {
        container.removeAttribute("data-site-category-stats");
      });
      return;
    }

    if (!config || !Array.isArray(config.resources)) return;

    const counts = categoryCountMap();
    const labels = categoryLabels();
    const candidate = homepageStatsCandidate(labels);
    const selectedContainer = candidate?.container || null;

    document.querySelectorAll(
      "[data-site-category-count]"
    ).forEach((badge) => {
      if (!selectedContainer?.contains(badge)) {
        badge.remove();
      }
    });

    document.querySelectorAll(
      "[data-site-category-stats]"
    ).forEach((container) => {
      if (container !== selectedContainer) {
        container.removeAttribute("data-site-category-stats");
      }
    });

    if (!candidate) return;

    selectedContainer.dataset.siteCategoryStats = "true";

    candidate.matches.forEach(({ child, label }) => {
      removeLegacyCategoryNumbers(child, label);

      let badge = child.querySelector(
        ":scope > [data-site-category-count]"
      );

      if (!badge) {
        badge = document.createElement("span");
        badge.dataset.siteCategoryCount = "true";
        badge.className = "site-category-count";
        child.appendChild(badge);
      }

      const count = counts.get(label) || 0;
      if (badge.textContent !== String(count)) {
        badge.textContent = String(count);
      }

      badge.setAttribute("aria-label", `${label}共${count}条`);
    });
  }

  function installBackToTop() {
    if (document.getElementById("siteBackToTop")) return;

    const button = document.createElement("button");
    button.id = "siteBackToTop";
    button.className = "site-back-to-top";
    button.type = "button";
    button.setAttribute("aria-label", "回到顶部");
    button.title = "回到顶部";
    button.textContent = "↑";
    document.body.appendChild(button);

    const update = () => {
      button.classList.toggle(
        "show",
        window.scrollY > Math.max(550, window.innerHeight * 0.75)
      );
    };

    button.addEventListener("click", () => {
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    });

    window.addEventListener("scroll", update, {
      passive: true
    });
    update();
  }

  function imageFallbackDataUrl() {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="320" height="420">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop stop-color="#f4f1f8"/>
            <stop offset="1" stop-color="#edf4f5"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" rx="24" fill="url(#g)"/>
        <circle cx="160" cy="175" r="42" fill="#ffffff" opacity=".9"/>
        <path d="M140 176l14 14 28-32" fill="none" stroke="#c15be8"
          stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="160" y="252" text-anchor="middle" font-family="sans-serif"
          font-size="18" fill="#7d8794">资源图片</text>
      </svg>
    `;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function optimizeImages() {
    const fallback = imageFallbackDataUrl();

    document.querySelectorAll("img").forEach((image, index) => {
      if (image.closest("#adminView")) return;

      if (!image.hasAttribute("decoding")) {
        image.decoding = "async";
      }

      if (
        index > 1
        && !image.hasAttribute("loading")
      ) {
        image.loading = "lazy";
      }

      if (image.dataset.siteImageHandled === "true") return;
      image.dataset.siteImageHandled = "true";

      image.addEventListener("error", () => {
        if (image.dataset.siteFallbackApplied === "true") return;

        image.dataset.siteFallbackApplied = "true";
        image.classList.add("site-image-fallback");
        image.src = fallback;
      });
    });
  }


  function schedulePublicRender() {
    clearTimeout(publicRenderTimer);
    publicRenderTimer = setTimeout(() => {
      applyStatusBadges();
      updateCategoryCounts();
      optimizeImages();
      installBackToTop();
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

  function transferDayStamp(date = new Date()) {
    const year = date.getFullYear();
    const month = String(
      date.getMonth() + 1
    ).padStart(2, "0");
    const day = String(
      date.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function storedTransferDay(value) {
    const normalized = normalize(value);

    if (!normalized) return "";

    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      return normalized;
    }

    const parsed = new Date(normalized);

    return Number.isNaN(parsed.getTime())
      ? ""
      : transferDayStamp(parsed);
  }

  function transferConfirmKey(resourceId, sourceLabel) {
    return `site-transfer-confirm:${resourceId}:${sourceLabel}`;
  }

  function alreadyConfirmed(resourceId, sourceLabel) {
    try {
      const stored = localStorage.getItem(
        transferConfirmKey(resourceId, sourceLabel)
      );

      return (
        storedTransferDay(stored)
        === transferDayStamp()
      );
    } catch {
      return false;
    }
  }

  function rememberConfirmed(resourceId, sourceLabel) {
    try {
      localStorage.setItem(
        transferConfirmKey(resourceId, sourceLabel),
        transferDayStamp()
      );
    } catch {}
  }

  function transferFailedKey(resourceId, sourceLabel) {
    return `site-transfer-failed:${resourceId}:${sourceLabel}`;
  }

  function alreadyFailed(resourceId, sourceLabel) {
    try {
      const stored = localStorage.getItem(
        transferFailedKey(resourceId, sourceLabel)
      );

      return (
        storedTransferDay(stored)
        === transferDayStamp()
      );
    } catch {
      return false;
    }
  }

  function rememberFailed(resourceId, sourceLabel) {
    try {
      localStorage.setItem(
        transferFailedKey(resourceId, sourceLabel),
        transferDayStamp()
      );
    } catch {}
  }

  const TRANSFER_PENDING_KEY =
    "site-transfer-confirm-pending-v2";

  function savePendingTransferConfirm(resource, sourceLabel) {
    const payload = {
      resourceId: String(resource?.id ?? ""),
      resourceTitle: normalize(resource?.title) || "当前资源",
      sourceLabel: normalize(sourceLabel) || "未知网盘",
      createdAt: Date.now()
    };

    try {
      sessionStorage.setItem(
        TRANSFER_PENDING_KEY,
        JSON.stringify(payload)
      );
    } catch {}

    return payload;
  }

  function readPendingTransferConfirm() {
    try {
      const raw = sessionStorage.getItem(
        TRANSFER_PENDING_KEY
      );

      if (!raw) return null;

      const payload = JSON.parse(raw);
      const age =
        Date.now() - Number(payload?.createdAt || 0);

      if (
        !payload
        || !payload.resourceId
        || !payload.sourceLabel
        || age < 0
        || age > 12 * 60 * 60 * 1000
      ) {
        sessionStorage.removeItem(
          TRANSFER_PENDING_KEY
        );
        return null;
      }

      return payload;
    } catch {
      return null;
    }
  }

  function clearPendingTransferConfirm() {
    try {
      sessionStorage.removeItem(
        TRANSFER_PENDING_KEY
      );
    } catch {}
  }

  function transferDriveIcon(sourceLabel) {
    const value = normalize(sourceLabel).toLowerCase();

    if (
      value.includes("百度")
      || value.includes("baidu")
    ) {
      return {
        className: "site-transfer-drive-baidu",
        text: "百",
        label: "百度网盘"
      };
    }

    if (
      value.includes("夸克")
      || value.includes("quark")
    ) {
      return {
        className: "site-transfer-drive-quark",
        text: "夸",
        label: "夸克网盘"
      };
    }

    if (value.includes("uc")) {
      return {
        className: "site-transfer-drive-uc",
        text: "UC",
        label: "UC网盘"
      };
    }

    if (
      value.includes("迅雷")
      || value.includes("xunlei")
      || value.includes("thunder")
    ) {
      return {
        className: "site-transfer-drive-xunlei",
        text: "⚡",
        label: "迅雷网盘"
      };
    }

    if (
      value.includes("阿里")
      || value.includes("aliyun")
      || value.includes("alipan")
    ) {
      return {
        className: "site-transfer-drive-aliyun",
        text: "阿",
        label: "阿里云盘"
      };
    }

    return {
      className: "site-transfer-drive-generic",
      text: "☁",
      label: sourceLabel || "网盘"
    };
  }

  function removeAllTransferConfirmLayers() {
    document
      .querySelectorAll(
        "#siteTransferConfirmOverlay,"
        + "#siteTransferConfirmDialogNative,"
        + ".site-transfer-confirm-overlay,"
        + ".site-transfer-native-dialog"
      )
      .forEach((element) => {
        try {
          if (
            element instanceof HTMLDialogElement
            && element.open
          ) {
            element.close();
          }
        } catch {}

        element.remove();
      });

    document.body.classList.remove(
      "site-transfer-confirm-open"
    );

    document
      .querySelectorAll(
        ".all-links-bottom-close"
        + "[data-transfer-close-locked]"
      )
      .forEach((button) => {
        button.disabled = false;
        button.removeAttribute(
          "data-transfer-close-locked"
        );
      });
  }

  function pulseNativeTransferDialog(dialog) {
    const card = dialog?.querySelector(
      ".site-transfer-confirm-dialog"
    );

    if (!card) return;

    card.classList.remove("attention");
    void card.offsetWidth;
    card.classList.add("attention");

    setTimeout(() => {
      card.classList.remove("attention");
    }, 380);
  }

  function closeNativeTransferDialog(result) {
    if (!["confirmed", "failed"].includes(result)) {
      const dialog = document.getElementById(
        "siteTransferConfirmDialogNative"
      );
      pulseNativeTransferDialog(dialog);
      return false;
    }

    clearPendingTransferConfirm();

    const dialog = document.getElementById(
      "siteTransferConfirmDialogNative"
    );

    if (dialog) {
      try {
        if (dialog.open) dialog.close();
      } catch {}

      dialog.remove();
    }

    document.body.classList.remove(
      "site-transfer-confirm-open"
    );

    document
      .querySelectorAll(
        ".all-links-bottom-close"
        + "[data-transfer-close-locked]"
      )
      .forEach((button) => {
        button.disabled = false;
        button.removeAttribute(
          "data-transfer-close-locked"
        );
      });

    return true;
  }

  function buildNativeTransferDialog(payload) {
    removeAllTransferConfirmLayers();

    const dialog = document.createElement("dialog");
    dialog.id = "siteTransferConfirmDialogNative";
    dialog.className = "site-transfer-native-dialog";

    const driveIcon = transferDriveIcon(
      payload.sourceLabel
    );

    const wasConfirmed = alreadyConfirmed(
      payload.resourceId,
      payload.sourceLabel
    );

    dialog.innerHTML = `
      <section
        class="site-transfer-confirm-dialog"
        aria-labelledby="siteTransferConfirmTitle"
        aria-describedby="siteTransferConfirmDescription"
      >
        <div
          class="site-transfer-confirm-visual"
          data-drive-type="${escapeHtml(
            driveIcon.className.replace(
              "site-transfer-drive-",
              ""
            )
          )}"
        >
          <span
            class="site-transfer-drive-icon ${escapeHtml(
              driveIcon.className
            )}"
            aria-label="${escapeHtml(driveIcon.label)}"
            title="${escapeHtml(driveIcon.label)}"
          >${escapeHtml(driveIcon.text)}</span>
        </div>

        <div class="site-transfer-confirm-heading">
          <small>转存结果确认</small>
          <h3 id="siteTransferConfirmTitle">
            是否已经保存到自己的网盘？
          </h3>
          <p id="siteTransferConfirmDescription">
            请选择真实结果后才能继续使用当前页面。
          </p>
        </div>

        <div class="site-transfer-confirm-resource">
          <span>当前资源</span>
          <strong>${escapeHtml(
            payload.resourceTitle || "当前资源"
          )}</strong>
          <small>${escapeHtml(
            payload.sourceLabel || "未知网盘"
          )}</small>
        </div>

        <div class="site-transfer-confirm-notice">
          ${
            wasConfirmed
              ? "请确认是否完成✅网盘文件的转存。本设备当天已经记录过，本次不会重复计数。"
              : "请确认是否完成✅网盘文件的转存。"
          }
        </div>

        <div class="site-transfer-confirm-buttons">
          <button
            class="site-transfer-confirm-success"
            type="button"
            data-transfer-dialog-confirm
          >
            <span>✓</span>
            <b>已完成转存</b>
          </button>

          <button
            class="site-transfer-confirm-failed"
            type="button"
            data-transfer-dialog-failed
          >
            <span>!</span>
            <b>保存失败</b>
          </button>
        </div>

        <p class="site-transfer-confirm-required">
          点击空白处不会关闭，必须选择以上一项
        </p>
      </section>
    `;

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      pulseNativeTransferDialog(dialog);
    });

    dialog.addEventListener("close", () => {
      if (readPendingTransferConfirm()) {
        setTimeout(() => {
          showNativeTransferDialog(
            readPendingTransferConfirm(),
            "unexpected-close"
          );
        }, 40);
      }
    });

    dialog.addEventListener("pointerdown", (event) => {
      if (event.target !== dialog) return;

      event.preventDefault();
      event.stopPropagation();
      pulseNativeTransferDialog(dialog);
    });

    dialog
      .querySelector("[data-transfer-dialog-confirm]")
      ?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const duplicate = alreadyConfirmed(
          payload.resourceId,
          payload.sourceLabel
        );

        if (!duplicate) {
          sendEvent("transfer_confirm", {
            resourceId: payload.resourceId,
            sourceLabel: payload.sourceLabel,
            title: payload.resourceTitle
          });

          rememberConfirmed(
            payload.resourceId,
            payload.sourceLabel
          );
        }

        const button = event.currentTarget;
        button.disabled = true;
        button.classList.add("selected");
        button.querySelector("b").textContent =
          duplicate
            ? "本设备已经记录"
            : "转存结果已记录";

        showToast(
          duplicate
            ? "本设备已经记录过，不会重复统计"
            : "已记录用户确认转存"
        );

        setTimeout(() => {
          closeNativeTransferDialog("confirmed");
        }, 420);
      });

    dialog
      .querySelector("[data-transfer-dialog-failed]")
      ?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const duplicate = alreadyFailed(
          payload.resourceId,
          payload.sourceLabel
        );

        if (!duplicate) {
          sendEvent("transfer_failed", {
            resourceId: payload.resourceId,
            sourceLabel: payload.sourceLabel,
            title: payload.resourceTitle
          });

          rememberFailed(
            payload.resourceId,
            payload.sourceLabel
          );
        }

        const button = event.currentTarget;
        button.disabled = true;
        button.classList.add("selected");
        button.querySelector("b").textContent =
          duplicate
            ? "本设备已经记录"
            : "失败结果已记录";

        showToast(
          duplicate
            ? "本设备已经提交过失败结果"
            : "已记录保存失败"
        );

        setTimeout(() => {
          closeNativeTransferDialog("failed");
        }, 420);
      });

    return dialog;
  }

  function showNativeTransferDialog(payload, reason) {
    if (!payload?.resourceId || !payload?.sourceLabel) {
      removeAllTransferConfirmLayers();
      return false;
    }

    const dialog = buildNativeTransferDialog(payload);
    dialog.dataset.restoreReason =
      normalize(reason) || "show";

    document.body.appendChild(dialog);
    document.body.classList.add(
      "site-transfer-confirm-open"
    );

    try {
      if (
        typeof dialog.showModal === "function"
      ) {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
        dialog.classList.add("fallback-open");
      }
    } catch {
      dialog.setAttribute("open", "");
      dialog.classList.add("fallback-open");
    }

    requestAnimationFrame(() => {
      dialog
        .querySelector(
          "[data-transfer-dialog-confirm]"
        )
        ?.focus({
          preventScroll: true
        });
    });

    return true;
  }

  function revealAfterOpenPrompt(
    modal,
    resource,
    sourceLabel
  ) {
    const payload = savePendingTransferConfirm(
      resource,
      sourceLabel
    );

    modal
      ?.querySelectorAll(".all-links-bottom-close")
      .forEach((button) => {
        button.disabled = true;
        button.dataset.transferCloseLocked = "true";
      });

    return showNativeTransferDialog(
      payload,
      "after-open"
    );
  }

  let transferRestoreTimer = null;

  function restorePendingTransferConfirm(reason) {
    clearTimeout(transferRestoreTimer);

    transferRestoreTimer = setTimeout(() => {
      const pending = readPendingTransferConfirm();

      if (!pending) {
        removeAllTransferConfirmLayers();
        return;
      }

      if (
        document.visibilityState === "hidden"
      ) {
        return;
      }

      showNativeTransferDialog(
        pending,
        reason || "restore"
      );
    }, 70);

    return true;
  }


  function removeLegacyTransferConfirmPanel(modal) {
    modal
      ?.querySelectorAll(
        ".site-transfer-confirm-panel,[data-site-after-open]"
      )
      .forEach((panel) => panel.remove());
  }

  function bindTransferOpenAction(link, modal, resource, sourceLabel) {
    if (!link || link.dataset.siteTransferBound === "true") return;

    link.dataset.siteTransferBound = "true";
    link.addEventListener("click", () => {
      removeLegacyTransferConfirmPanel(modal);
      savePendingTransferConfirm(
        resource,
        sourceLabel
      );
      sendEvent("source_open", { resourceId: String(resource.id), title: resource.title, sourceLabel });
      link.classList.add("opened");
      link.textContent = "已打开网盘，请完成保存";

      setTimeout(() => {
        if (
          document.visibilityState === "visible"
          && document.hasFocus()
          && readPendingTransferConfirm()
        ) {
          restorePendingTransferConfirm(
            "link-open-visible"
          );
        }
      }, 900);

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
    const field = document.createElement("section");
    field.className =
      "resource-recommend-source-field resource-front-settings-field";
    field.dataset.resourceRecommendField = "true";

    field.innerHTML = `
      <span class="resource-recommend-source-copy">
        <strong>当前资源前台设置</strong>
        <small>
          推荐网盘和有效状态只作用于这一条资源，
          点击“保存并发布”后生效
        </small>
      </span>

      <div class="resource-front-settings-controls">
        <label class="resource-front-setting-control">
          <span>推荐网盘</span>
          <select
            data-resource-recommended-source="${escapeHtml(resource.id)}"
            data-resource-index="${index}"
          >
            ${recommendationOptions(resource)}
          </select>
        </label>

        <label class="resource-front-setting-control">
          <span>资源状态</span>
          <select
            data-resource-status-editor="${escapeHtml(resource.id)}"
            data-resource-index="${index}"
          >
            ${statusOptions(normalize(resource.siteStatus))}
          </select>
        </label>
      </div>
    `;

    field
      .querySelector("[data-resource-recommended-source]")
      ?.addEventListener("change", (event) => {
        resource.recommendedSourceId =
          normalize(event.currentTarget.value);
        markRecommendationDirty();
      });

    field
      .querySelector("[data-resource-status-editor]")
      ?.addEventListener("change", (event) => {
        resource.siteStatus =
          normalize(event.currentTarget.value);
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
        const statusSelect = existing.querySelector(
          "[data-resource-status-editor]"
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

        if (statusSelect) {
          statusSelect.dataset.resourceStatusEditor =
            String(resource.id);
          statusSelect.dataset.resourceIndex = String(index);

          if (
            document.activeElement !== statusSelect
            && !recommendationDirty
          ) {
            statusSelect.innerHTML = statusOptions(
              normalize(resource.siteStatus)
            );
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
    const feedback = Array.isArray(ops.feedback) ? ops.feedback : [];
    const requests = Array.isArray(ops.requests) ? ops.requests : [];
    const pendingFeedback = feedback.filter((item) => item.status !== "resolved").length;
    const pendingRequests = requests.filter((item) => item.status !== "done").length;
    const metricTotal = (map) => Object.values(map || {}).reduce((sum,item)=>sum+Number(item?.count||0),0);
    const transferOpens = ops.stats?.transferOpens || {};
    const transferConfirms = ops.stats?.transferConfirms || {};
    const transferFailures = ops.stats?.transferFailures || {};
    const openTotal = metricTotal(transferOpens);
    const confirmTotal = metricTotal(transferConfirms);
    const failureTotal = metricTotal(transferFailures);
    const confirmRate = openTotal ? `${(confirmTotal/openTotal*100).toFixed(1)}%` : "0%";
    const transferRows = Object.entries(transferOpens).sort((a,b)=>Number(b[1]?.count||0)-Number(a[1]?.count||0)).slice(0,30).map(([key,item])=>{
      const source=key.split("::").slice(1).join("::")||"未知网盘";
      const confirmed=Number(transferConfirms[key]?.count||0);
      const failed=Number(transferFailures[key]?.count||0);
      const opened=Number(item?.count||0);
      return `<div class="site-ops-row site-transfer-data-row"><span><strong>${escapeHtml(item?.title||key.split("::")[0])}</strong><small>${escapeHtml(source)}</small></span><span>打开 ${opened}｜确认 ${confirmed}｜失败 ${failed}</span><span>${opened?(confirmed/opened*100).toFixed(1):"0.0"}%</span></div>`;
    }).join("");

    panel.innerHTML = `
      <div class="site-ops-intro">
        <div>
          <span class="eyebrow">OPERATIONS</span>
          <h2>网站运营中心</h2>
          <p>统一查看失效反馈、用户需求、转存和点击数据；资源状态已移到每条资源编辑卡片。</p>
        </div>
        <div class="site-ops-intro-actions">
          <button class="site-ops-reset" type="button" data-site-ops-reset>重置运营数据</button>
          <button class="site-ops-refresh" type="button" data-site-ops-refresh>刷新数据</button>
        </div>
      </div>

      <div class="site-ops-summary">
        <article><small>待处理失效反馈</small><strong>${pendingFeedback}</strong></article>
        <article><small>待添加资源需求</small><strong>${pendingRequests}</strong></article>
        <article><small>资源打开次数</small><strong>${topEntries(ops.stats?.resources, 9999).reduce((sum, [, item]) => sum + Number(item.count || 0), 0)}</strong></article>
        <article><small>进群入口点击</small><strong>${Number(ops.stats?.qr?.count || 0)}</strong></article>
      </div>

      <section class="site-ops-section">
        <div class="site-ops-section-head"><div><h3>链接失效反馈</h3><p>用户可在网盘链接弹窗中反馈失效。</p></div></div>
        ${feedbackRows(feedback)}
      </section>

      <section class="site-ops-section">
        <div class="site-ops-section-head"><div><h3>用户资源需求</h3><p>搜索无结果时，用户可以直接提交需求。</p></div></div>
        ${requestRows(requests)}
      </section>

      <section class="site-ops-section">
        <div class="site-ops-section-head"><div><h3>转存数据</h3><p>“用户确认转存”按浏览器去重，不代表网盘官方验证。</p></div></div>
        <div class="site-ops-summary site-transfer-summary-grid">
          <article><small>打开网盘</small><strong>${openTotal}</strong></article>
          <article><small>用户确认转存</small><strong>${confirmTotal}</strong></article>
          <article><small>保存失败</small><strong>${failureTotal}</strong></article>
          <article><small>确认转化率</small><strong>${confirmRate}</strong></article>
        </div>
        <div class="site-ops-table">${transferRows || '<div class="site-ops-empty">暂无转存数据</div>'}</div>
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
    panel.querySelector("[data-site-ops-refresh]")?.addEventListener(
      "click",
      loadAdminData
    );

    panel.querySelector("[data-site-ops-reset]")?.addEventListener(
      "click",
      async (event) => {
        const button = event.currentTarget;

        const confirmed = window.confirm(
          "确定重置运营数据吗？\n\n"
          + "将清空失效反馈、资源需求、资源打开次数、"
          + "进群点击和搜索统计。\n\n"
          + "资源、网盘链接和资源状态不会被删除。"
        );

        if (!confirmed) return;

        button.disabled = true;
        button.textContent = "正在重置…";

        try {
          await fetchJson("/api/admin/site-ops/reset", {
            method: "POST",
            body: JSON.stringify({
              confirm: "RESET_OPERATIONS_DATA"
            })
          });

          showToast("运营数据已重置");
          await loadAdminData();
        } catch (error) {
          showToast(error.message || "重置失败");
          button.disabled = false;
          button.textContent = "重新重置";
        }
      }
    );

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

    window.addEventListener("pageshow", (event) => {
      refreshPublicStatuses();

      setTimeout(() => {
        restorePendingTransferConfirm(
          event.persisted
            ? "pageshow-bfcache"
            : "pageshow"
        );
      }, 40);
    });

    window.addEventListener("focus", () => {
      refreshPublicStatuses();

      setTimeout(() => {
        restorePendingTransferConfirm("focus");
      }, 90);
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        refreshPublicStatuses();

        setTimeout(() => {
          restorePendingTransferConfirm(
            "visibility-visible"
          );
        }, 60);
      }
    });

    setTimeout(() => {
      restorePendingTransferConfirm(
        "initial-public-load"
      );
    }, 120);

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
