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
    return target.closest(
      "button,article,li,.resource-card,.resource-item,.recent-update-item,.search-result-item"
    ) || target;
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

  function statusHost(card) {
    const known = card.querySelector(
      ".recent-update-meta,[class*='resource-meta'],[class*='item-meta'],[class*='card-meta']"
    );
    if (known) return known;

    const heat = smallestLeafContaining(card, /🔥/);
    if (heat?.parentElement) return heat.parentElement;

    const tag = smallestLeafContaining(card, /网盘|电影|短剧|动漫|影视|小说|学习资料/);
    return tag?.parentElement || null;
  }

  function applyStatusBadges() {
    const statuses = publicOps.statuses || {};
    const seenCards = new Set();

    document.querySelectorAll("[data-resource-id]").forEach((target) => {
      const resourceId = String(target.dataset.resourceId || "");
      const status = statuses[resourceId]?.status;
      const info = STATUS_INFO[status];
      const card = cardForTarget(target);

      if (!card || seenCards.has(card)) return;
      seenCards.add(card);

      card.querySelectorAll("[data-site-resource-status]").forEach((badge) => badge.remove());
      if (!info) return;

      const host = statusHost(card);
      if (!host) return;

      const badge = document.createElement("span");
      badge.className = `site-resource-status ${info.className}`;
      badge.dataset.siteResourceStatus = "true";
      badge.textContent = `${info.icon} ${info.label}`;
      host.appendChild(badge);
    });
  }

  function schedulePublicRender() {
    clearTimeout(publicRenderTimer);
    publicRenderTimer = setTimeout(() => {
      applyStatusBadges();
      enhanceLinksModal();
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

  function noResultHost() {
    return document.querySelector("main")
      || document.querySelector(".page-shell")
      || document.querySelector(".app")
      || document.body;
  }

  function removeNoResultCard() {
    document.getElementById(NO_RESULT_ID)?.remove();
  }

  function showNoResultCard(keyword) {
    removeNoResultCard();
    if (!normalize(keyword) || visibleResourceCount() > 0) return;
    if (publicOps.settings?.requestEnabled === false) return;

    const card = document.createElement("section");
    card.id = NO_RESULT_ID;
    card.innerHTML = `
      <div class="site-no-result-icon">⌕</div>
      <h3>没有找到“${escapeHtml(keyword)}”</h3>
      <p>可以缩短关键词重新搜索，也可以提交资源需求。后台会自动统计需求次数。</p>
      <div class="site-no-result-actions">
        <input type="text" value="${escapeHtml(keyword)}" maxlength="120" data-site-request-input />
        <button type="button" data-site-request-submit>提交资源需求</button>
      </div>
      <div class="site-request-message" data-site-request-message></div>
    `;

    noResultHost().appendChild(card);

    card.querySelector("[data-site-request-submit]")?.addEventListener("click", async () => {
      const button = card.querySelector("[data-site-request-submit]");
      const input = card.querySelector("[data-site-request-input]");
      const message = card.querySelector("[data-site-request-message]");
      const value = normalize(input?.value);
      if (!value) return;

      button.disabled = true;
      button.textContent = "正在提交…";
      try {
        const payload = await fetchJson("/api/site-ops/request", {
          method: "POST",
          body: JSON.stringify({ keyword: value })
        });
        message.textContent = payload.message || "需求已提交";
        button.textContent = "已提交";
      } catch (error) {
        message.style.color = "#d84e4e";
        message.textContent = error.message;
        button.disabled = false;
        button.textContent = "重新提交";
      }
    });
  }

  function handleSearchSubmitted(keyword) {
    const value = normalize(keyword);
    if (!value) return;
    sendEvent("search", { key: value });
    clearTimeout(noResultTimer);
    noResultTimer = setTimeout(() => showNoResultCard(value), 650);
  }

  function resourceFromOpenModal(modal) {
    const title = normalize(modal.querySelector(".all-links-success span")?.textContent);
    if (!title) return null;
    return resources().find((resource) => normalize(resource.title) === title) || null;
  }

  function enhanceLinksModal() {
    clearTimeout(modalEnhanceTimer);
    modalEnhanceTimer = setTimeout(() => {
      const modal = document.getElementById("allCloudLinksModal");
      if (!modal || modal.hidden) return;

      const resource = resourceFromOpenModal(modal);
      if (!resource) return;

      if (modal.dataset.siteTrackedResource !== String(resource.id)) {
        modal.dataset.siteTrackedResource = String(resource.id);
        sendEvent("resource_open", {
          resourceId: String(resource.id),
          title: resource.title
        });
      }

      if (publicOps.settings?.feedbackEnabled === false) return;

      modal.querySelectorAll(".all-links-card").forEach((card) => {
        if (card.querySelector("[data-site-feedback]")) return;
        const sourceLabel = normalize(
          card.querySelector(".all-links-provider-badge")?.textContent || "全部网盘"
        );

        const button = document.createElement("button");
        button.type = "button";
        button.className = "site-feedback-button";
        button.dataset.siteFeedback = "true";
        button.textContent = `链接失效？反馈${sourceLabel}`;

        button.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          button.disabled = true;
          button.textContent = "正在提交…";
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
            button.textContent = "✓ 已反馈，感谢提醒";
          } catch (error) {
            button.disabled = false;
            button.textContent = error.message || "提交失败，请重试";
          }
        });

        card.appendChild(button);
      });

      modal.querySelectorAll(".all-links-open").forEach((link) => {
        if (link.dataset.siteSourceTracked === "true") return;
        link.dataset.siteSourceTracked = "true";
        link.addEventListener("click", () => {
          const card = link.closest(".all-links-card");
          const sourceLabel = normalize(
            card?.querySelector(".all-links-provider-badge")?.textContent || "网盘"
          );
          sendEvent("source_open", { sourceLabel });
        });
      });
    }, 80);
  }

  function installPublicTracking() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest("button,a,[role='button']");
      if (!button) return;
      const text = normalize(button.textContent);

      if (["默认", "最热", "评分", "年份"].includes(text)) {
        sendEvent("sort", { key: text });
        setTimeout(removeNoResultCard, 80);
      }

      if (button.matches(".qr-promo-floating") || button.closest(".qr-promo-floating")) {
        sendEvent("qr_open");
      }
    });
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
        await fetchJson("/api/admin/site-ops/statuses", {
          method: "PUT",
          body: JSON.stringify({ statuses })
        });
        showToast("资源状态已保存");
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
    try {
      const [configPayload, opsPayload] = await Promise.all([
        fetchJson("/api/config"),
        fetchJson("/api/site-ops/public")
      ]);
      config = configPayload;
      publicOps = opsPayload;
    } catch {
      return;
    }

    installSearchSuggestions();
    installPublicTracking();
    schedulePublicRender();

    const observer = new MutationObserver(schedulePublicRender);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function initializeAdmin() {
    addStyles();
    installAdminCenter();
    const observer = new MutationObserver(installAdminCenter);
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
