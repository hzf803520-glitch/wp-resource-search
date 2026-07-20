(() => {
  "use strict";

  const KEYS = {
    enabled: "recentUpdatesEnabled",
    title: "recentUpdatesTitle",
    limit: "recentUpdatesLimit",
    moreText: "recentUpdatesMoreText"
  };

  const DEFAULTS = {
    enabled: "show",
    title: "最近更新",
    limit: 10,
    moreText: "查看更多"
  };

  const SECTION_ID = "recentUpdatesSection";
  const ADMIN_SECTION_ID = "recentUpdatesSettingsSection";
  const STYLE_ID = "recentUpdatesStyles";
  const PAGE_ID = "resourceDedicatedListPage";
  const PAGE_MODES = new Set(["recent", "hot", "popular", "rating", "category", "source"]);

  let currentConfig = null;
  let adminLoading = false;
  let publicTimer = null;

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

  function safeLimit(value) {
    return Math.max(3, Math.min(30, Number(value) || DEFAULTS.limit));
  }

  async function fetchConfig(admin = false) {
    const response = await fetch(admin ? "/api/admin/config" : "/api/config", {
      credentials: "same-origin",
      cache: "no-store"
    });
    if (!response.ok) throw new Error("配置暂不可用");
    return response.json();
  }

  function valuesFromConfig(config) {
    return {
      enabled: normalize(config?.settings?.[KEYS.enabled]) === "hide" ? "hide" : "show",
      title: normalize(config?.settings?.[KEYS.title]) || DEFAULTS.title,
      limit: safeLimit(config?.settings?.[KEYS.limit]),
      moreText: normalize(config?.settings?.[KEYS.moreText]) || DEFAULTS.moreText
    };
  }

  function timestamp(resource) {
    if (resource?.updatedTracked !== true) return 0;

    const value = Date.parse(resource?.updatedAt || "");
    return Number.isFinite(value) ? value : 0;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function sourceLabels(resource, config) {
    const sourceMap = new Map(
      (Array.isArray(config?.sources) ? config.sources : [])
        .map((source) => [String(source.id), normalize(source.label)])
    );

    return Object.entries(resource?.links || {})
      .filter(([, link]) => normalize(link))
      .map(([sourceId]) => sourceMap.get(String(sourceId)) || "网盘")
      .slice(0, 3);
  }

  function recentResources(config) {
    return (Array.isArray(config?.resources) ? config.resources : [])
      .filter((resource) => (
        resource?.visible !== false
        && resource?.updatedTracked === true
        && timestamp(resource) > 0
      ))
      .map((resource, index) => ({ resource, index }))
      .sort((left, right) => {
        const timeDifference =
          timestamp(right.resource) - timestamp(left.resource);

        if (timeDifference !== 0) return timeDifference;

        const rightId = Number(right.resource.id) || 0;
        const leftId = Number(left.resource.id) || 0;
        if (rightId !== leftId) return rightId - leftId;

        return right.index - left.index;
      })
      .map(({ resource }) => resource);
  }


  function visibleResources(config) {
    return (Array.isArray(config?.resources) ? config.resources : [])
      .filter((resource) => resource?.visible !== false);
  }

  function sourceLabelMap(config) {
    return new Map(
      (Array.isArray(config?.sources) ? config.sources : [])
        .map((source) => [String(source.id), normalize(source.label)])
    );
  }

  function resourceMatchesSource(resource, sourceName, config) {
    const labels = sourceLabelMap(config);
    const expected = normalize(sourceName);

    return Object.entries(resource?.links || {}).some(([sourceId, link]) => {
      if (!normalize(link)) return false;
      return labels.get(String(sourceId)) === expected;
    });
  }

  function dedicatedContext() {
    const params = new URLSearchParams(window.location.search);
    const view = normalize(params.get("view")).toLowerCase();

    return {
      view: view === "recent" ? "recent" : "",
      value: ""
    };
  }

  function isDedicatedListPage() {
    return Boolean(dedicatedContext().view);
  }

  function pageDefinition(context, config) {
    const values = valuesFromConfig(config);
    const settings = config?.settings || {};

    switch (context.view) {
      case "hot":
        return {
          title: normalize(settings.hotTitle) || "热门资源",
          subtitle: "按前台热门资源顺序显示",
          summary: "热门资源",
          searchPlaceholder: "搜索热门资源"
        };
      case "popular":
        return {
          title: normalize(settings.popularTitle) || "人气榜",
          subtitle: "按资源热度从高到低排列",
          summary: "人气资源",
          searchPlaceholder: "搜索人气资源"
        };
      case "rating":
        return {
          title: normalize(settings.ratingTitle) || "好评榜",
          subtitle: "按资源评分从高到低排列",
          summary: "高评分资源",
          searchPlaceholder: "搜索高评分资源"
        };
      case "category":
        return {
          title: context.value || "分类资源",
          subtitle: "仅显示当前分类中的资源",
          summary: `${context.value || "分类"}资源`,
          searchPlaceholder: `搜索${context.value || "分类"}资源`
        };
      case "source":
        return {
          title: context.value || "网盘资源",
          subtitle: "仅显示当前网盘中可用的资源",
          summary: `${context.value || "网盘"}资源`,
          searchPlaceholder: `搜索${context.value || "网盘"}资源`
        };
      case "recent":
      default:
        return {
          title: values.title,
          subtitle: "按最后保存时间倒序排列",
          summary: "最近更新资源",
          searchPlaceholder: "搜索最近更新资源"
        };
    }
  }

  function resourcesForContext(context, config) {
    const resources = visibleResources(config);

    switch (context.view) {
      case "hot":
        // Preserve the manual resource order used by the homepage.
        return resources;
      case "popular":
        return [...resources].sort((left, right) => {
          const heatDifference = (Number(right.heat) || 0) - (Number(left.heat) || 0);
          if (heatDifference !== 0) return heatDifference;
          return (Number(right.id) || 0) - (Number(left.id) || 0);
        });
      case "rating":
        return [...resources].sort((left, right) => {
          const ratingDifference = (Number(right.rating) || 0) - (Number(left.rating) || 0);
          if (ratingDifference !== 0) return ratingDifference;
          return (Number(right.heat) || 0) - (Number(left.heat) || 0);
        });
      case "category":
        return resources.filter((resource) => (
          normalize(resource.category) === normalize(context.value)
        ));
      case "source":
        return resources.filter((resource) => (
          resourceMatchesSource(resource, context.value, config)
        ));
      case "recent":
      default:
        return recentResources(config);
    }
  }

  function metricMarkup(resource, context, config) {
    if (context.view === "popular") {
      return `<span class="recent-update-date">🔥 ${Math.max(0, Number(resource.heat) || 0)}</span>`;
    }

    if (context.view === "rating") {
      const rating = Math.max(0, Math.min(10, Number(resource.rating) || 0));
      return `<span class="recent-update-rating">⭐ ${rating.toFixed(1)}</span>`;
    }

    if (context.view === "recent") {
      const date = formatDate(timestamp(resource));
      return date
        ? `<span class="recent-update-date">${escapeHtml(date)}</span>`
        : "";
    }

    const updateText = normalize(resource.update);
    return updateText
      ? `<span class="recent-update-date">${escapeHtml(updateText)}</span>`
      : "";
  }

  // ---------------- Backend configuration ----------------

  function createAdminSection(values) {
    const section = document.createElement("div");
    section.className = "editor-section";
    section.id = ADMIN_SECTION_ID;
    section.innerHTML = `
      <div class="section-title">
        <div>
          <h3>最近更新板块</h3>
          <p>配置前台最近更新列表。资源新增或修改后，点击“保存并发布”才会更新排序。</p>
        </div>
      </div>

      <div class="form-grid">
        <label class="field">
          <span>显示状态</span>
          <select data-setting="${KEYS.enabled}" data-recent-updates-select>
            <option value="show"${values.enabled === "show" ? " selected" : ""}>显示</option>
            <option value="hide"${values.enabled === "hide" ? " selected" : ""}>隐藏</option>
          </select>
        </label>

        <label class="field">
          <span>默认显示条数</span>
          <input type="number" min="3" max="30"
            data-setting="${KEYS.limit}" value="${values.limit}" />
        </label>

        <label class="field wide">
          <span>板块标题</span>
          <input data-setting="${KEYS.title}" value="${escapeHtml(values.title)}" />
        </label>

        <label class="field wide">
          <span>查看更多按钮文字</span>
          <input data-setting="${KEYS.moreText}" value="${escapeHtml(values.moreText)}" />
        </label>
      </div>
    `;
    return section;
  }

  function bindAdminSection() {
    document.querySelectorAll("[data-recent-updates-select]").forEach((select) => {
      if (select.dataset.bound) return;
      select.dataset.bound = "true";
      select.addEventListener("change", () => {
        select.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
  }

  async function ensureAdminSection() {
    if (!location.pathname.startsWith("/admin")) return;

    const existing = document.getElementById(ADMIN_SECTION_ID);
    if (existing) {
      bindAdminSection();
      return;
    }

    if (adminLoading) return;

    const host = document.querySelector("#settingsEditor");
    if (!host || !host.children.length) return;

    adminLoading = true;
    try {
      const config = await fetchConfig(true);
      host.appendChild(createAdminSection(valuesFromConfig(config)));
      bindAdminSection();
    } catch {
      // Login or admin rendering may still be in progress.
    } finally {
      adminLoading = false;
    }
  }

  function startAdmin() {
    ensureAdminSection();
    setInterval(ensureAdminSection, 1000);
  }

  // ---------------- Public section ----------------

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .recent-updates-section {
        display: block;
        width: 100%;
        max-width: none;
        box-sizing: border-box;
        margin: 12px 0;
        padding: 15px 14px;
        border-radius: 14px;
        background: #fff;
        box-shadow: 0 5px 18px rgba(35, 45, 60, .07);
      }
      .recent-updates-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 11px;
      }
      .recent-updates-title {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 7px;
      }
      .recent-updates-icon {
        display: grid;
        width: 20px;
        height: 20px;
        place-items: center;
        border-radius: 5px;
        color: #fff;
        background: linear-gradient(135deg, #5c92c7, #376b9c);
        font-size: 9px;
        font-weight: 800;
      }
      .recent-updates-title h2 {
        overflow: hidden;
        margin: 0;
        color: #2c3441;
        font-size: 16px;
        font-weight: 800;
        line-height: 1.4;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .recent-updates-more {
        flex: none;
        border: 0;
        padding: 3px 0;
        color: #626a75;
        background: transparent;
        font-size: 12px;
        cursor: pointer;
      }
      .recent-updates-list {
        display: grid;
        gap: 8px;
      }
      .recent-update-item {
        display: grid;
        grid-template-columns: 30px minmax(0, 1fr) 18px;
        align-items: center;
        gap: 9px;
        min-height: 58px;
        border: 0;
        border-radius: 10px;
        padding: 8px 9px;
        color: inherit;
        background: #f4f4f5;
        text-align: left;
        cursor: pointer;
        transition: transform .16s ease, background .16s ease;
      }
      .recent-update-item:hover {
        transform: translateY(-1px);
        background: #f0f1f3;
      }
      .recent-update-rank {
        display: grid;
        width: 24px;
        height: 24px;
        place-items: center;
        border-radius: 7px;
        color: #fff;
        background: #c9cdd2;
        font-size: 12px;
        font-weight: 800;
      }
      .recent-update-item:nth-child(1) .recent-update-rank {
        background: linear-gradient(135deg, #ff6c61, #ff8a62);
      }
      .recent-update-item:nth-child(2) .recent-update-rank {
        background: linear-gradient(135deg, #ff884e, #ffa34c);
      }
      .recent-update-item:nth-child(3) .recent-update-rank {
        background: linear-gradient(135deg, #ffab35, #ffc247);
      }
      .recent-update-copy {
        min-width: 0;
      }
      .recent-update-copy strong {
        display: block;
        overflow: hidden;
        color: #343a45;
        font-size: 13px;
        font-weight: 500;
        line-height: 1.45;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .recent-update-meta {
        display: flex;
        overflow: hidden;
        align-items: center;
        gap: 6px;
        margin-top: 4px;
        white-space: nowrap;
      }
      .recent-update-source {
        display: inline-flex;
        min-height: 17px;
        align-items: center;
        border-radius: 3px;
        padding: 1px 5px;
        color: #ff5f65;
        background: #ffe8ea;
        font-size: 9px;
        line-height: 1.2;
      }
      .recent-update-date {
        overflow: hidden;
        color: #777e88;
        font-size: 9px;
        text-overflow: ellipsis;
      }
      .recent-update-rating {
        display: inline-flex;
        align-items: center;
        min-height: 17px;
        border-radius: 4px;
        padding: 1px 6px;
        color: #f28a00;
        background: #fff3dc;
        font-size: 10px;
        font-weight: 700;
        line-height: 1.2;
      }
      .recent-update-arrow {
        color: #aab0b8;
        font-size: 22px;
        font-weight: 300;
        line-height: 1;
        text-align: center;
      }
      .recent-updates-page {
        position: fixed;
        inset: 0;
        z-index: 7000;
        overflow-y: auto;
        overscroll-behavior: contain;
        background:
          linear-gradient(180deg, #eaf8fb 0%, #eef8fa 52%, #e9f7f9 100%);
      }
      .recent-updates-page-shell {
        width: min(100%, 520px);
        min-height: 100%;
        box-sizing: border-box;
        margin: 0 auto;
        padding: 12px 12px 30px;
        background: rgba(255,255,255,.35);
      }
      .recent-updates-page-head {
        position: sticky;
        top: 0;
        z-index: 2;
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr) 38px;
        align-items: center;
        gap: 8px;
        min-height: 58px;
        margin: -12px -12px 12px;
        padding: 8px 12px;
        border-bottom: 1px solid rgba(217,226,232,.8);
        background: rgba(255,255,255,.94);
        backdrop-filter: blur(12px);
      }
      .recent-updates-page-back {
        display: grid;
        width: 36px;
        height: 36px;
        place-items: center;
        border: 0;
        border-radius: 50%;
        color: #313944;
        background: #f1f3f5;
        font-size: 25px;
        line-height: 1;
        cursor: pointer;
      }
      .recent-updates-page-title {
        min-width: 0;
        text-align: center;
      }
      .recent-updates-page-title strong {
        display: block;
        overflow: hidden;
        color: #27303c;
        font-size: 18px;
        font-weight: 800;
        line-height: 1.35;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .recent-updates-page-title small {
        display: block;
        margin-top: 2px;
        color: #8a919c;
        font-size: 10px;
        line-height: 1.3;
      }
      .recent-updates-page-search {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 44px;
        margin-bottom: 12px;
        border-radius: 14px;
        padding: 0 14px;
        background: #fff;
        box-shadow: 0 4px 16px rgba(37,48,64,.07);
      }
      .recent-updates-page-search span {
        flex: none;
        color: #9aa1ab;
        font-size: 17px;
      }
      .recent-updates-page-search input {
        min-width: 0;
        flex: 1;
        border: 0;
        outline: 0;
        color: #333b46;
        background: transparent;
        font-size: 13px;
      }
      .recent-updates-page-card {
        border-radius: 16px;
        padding: 14px 12px;
        background: #fff;
        box-shadow: 0 6px 20px rgba(37,48,64,.08);
      }
      .recent-updates-page-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 11px;
        padding: 0 2px;
      }
      .recent-updates-page-summary strong {
        color: #303844;
        font-size: 15px;
        font-weight: 800;
      }
      .recent-updates-page-summary span {
        color: #8a919b;
        font-size: 11px;
      }
      .recent-updates-page-empty {
        border-radius: 12px;
        padding: 34px 18px;
        color: #8a919b;
        background: #f4f5f6;
        font-size: 13px;
        text-align: center;
      }
      body.recent-updates-page-open {
        overflow: hidden;
      }
      @media (max-width: 430px) {
        .recent-updates-section {
          width: 100%;
          margin: 12px 0;
          padding: 14px 14px;
        }
        .recent-updates-page-shell {
          width: 100%;
          padding-left: 10px;
          padding-right: 10px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function elementText(element) {
    return normalize(element?.textContent);
  }

  function closestSectionContainer(element) {
    if (!element) return null;

    return element.closest(
      "section, article, .section, .panel, .card, .resource-section, .ranking-section, .content-card"
    ) || element.parentElement?.parentElement || element.parentElement;
  }

  function findHotResourcesSection(config) {
    const configuredTitle = normalize(config?.settings?.hotTitle) || "🔥 热门资源";
    const titleCandidates = [configuredTitle, "🔥 热门资源", "热门资源"];

    const headingSelectors = [
      "h1", "h2", "h3", "h4",
      ".section-title", ".panel-title", ".card-title",
      "[data-section-title]", "[class*='title']"
    ];

    for (const selector of headingSelectors) {
      for (const element of document.querySelectorAll(selector)) {
        const text = elementText(element);
        if (!text) continue;

        const matched = titleCandidates.some((title) => {
          const plainTitle = title.replace(/^🔥\s*/, "");
          return text === title || text === plainTitle || text.includes(plainTitle);
        });

        if (!matched) continue;

        const section = closestSectionContainer(element);
        if (section && section.id !== SECTION_ID) return section;
      }
    }

    return null;
  }

  function findPlacementTarget(config) {
    const hotSection = findHotResourcesSection(config);

    if (hotSection?.parentElement) {
      return {
        parent: hotSection.parentElement,
        before: hotSection.nextElementSibling
      };
    }

    const disclaimer = document.getElementById("configurableDisclaimerCard");
    if (disclaimer?.parentElement) {
      return { parent: disclaimer.parentElement, before: disclaimer };
    }

    const footer = document.querySelector("footer, .site-footer, .page-footer");
    if (footer?.parentElement) {
      return { parent: footer.parentElement, before: footer };
    }

    const main = document.querySelector(
      ".app-shell, .home-shell, .search-shell, .page-shell, main"
    );

    return { parent: main || document.body, before: null };
  }

  function itemMarkup(resource, index, config) {
    const labels = sourceLabels(resource, config);
    const date = formatDate(timestamp(resource));

    return `
      <button class="recent-update-item" type="button"
        data-resource-id="${escapeHtml(resource.id)}">
        <span class="recent-update-rank">${index + 1}</span>
        <span class="recent-update-copy">
          <strong>${escapeHtml(resource.title || resource.artTitle || "未命名资源")}</strong>
          <span class="recent-update-meta">
            ${labels.map((label) => (
              `<span class="recent-update-source">${escapeHtml(label)}</span>`
            )).join("")}
            ${date ? `<span class="recent-update-date">${escapeHtml(date)}</span>` : ""}
          </span>
        </span>
        <span class="recent-update-arrow">›</span>
      </button>
    `;
  }

  function isHomepageOnly() {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);

    const homePath = (
      path === "/"
      || path === "/index.html"
      || path.endsWith("/index.html")
    );

    const hasFilterOrDedicatedView = [
      "view",
      "category",
      "source",
      "sort",
      "keyword",
      "q",
      "search",
      "type",
      "filter"
    ].some((key) => normalize(params.get(key)));

    return homePath && !hasFilterOrDedicatedView;
  }

  function renderPublic(config) {
    document.getElementById(SECTION_ID)?.remove();

    // 最近更新只允许显示在首页，所有搜索、分类、网盘和榜单页面均隐藏。
    if (!isHomepageOnly()) return;

    const values = valuesFromConfig(config);
    if (values.enabled !== "show") return;

    const resources = recentResources(config);
    if (!resources.length) return;

    ensureStyles();

    const displayed = resources.slice(0, values.limit);
    const canExpand = resources.length > values.limit;

    const section = document.createElement("section");
    section.id = SECTION_ID;
    section.className = "recent-updates-section";
    section.innerHTML = `
      <div class="recent-updates-head">
        <div class="recent-updates-title">
          <span class="recent-updates-icon">NEW</span>
          <h2>${escapeHtml(values.title)}</h2>
        </div>
        ${
          canExpand
            ? `<button class="recent-updates-more" type="button" data-recent-updates-more>
                ${escapeHtml(values.moreText)} ›
              </button>`
            : ""
        }
      </div>
      <div class="recent-updates-list">
        ${displayed.map((resource, index) => itemMarkup(resource, index, config)).join("")}
      </div>
    `;

    section.querySelector("[data-recent-updates-more]")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.location.href = "/search.html?view=recent";
    });

    const placement = findPlacementTarget(config);
    if (placement.before) {
      placement.parent.insertBefore(section, placement.before);
    } else {
      placement.parent.appendChild(section);
    }
  }


  function dedicatedItemMarkup(resource, index, config, context) {
    const labels = sourceLabels(resource, config);

    return `
      <button class="recent-update-item" type="button"
        data-resource-id="${escapeHtml(resource.id)}">
        <span class="recent-update-rank">${index + 1}</span>
        <span class="recent-update-copy">
          <strong>${escapeHtml(resource.title || resource.artTitle || "未命名资源")}</strong>
          <span class="recent-update-meta">
            ${labels.map((label) => (
              `<span class="recent-update-source">${escapeHtml(label)}</span>`
            )).join("")}
            ${metricMarkup(resource, context, config)}
          </span>
        </span>
        <span class="recent-update-arrow">›</span>
      </button>
    `;
  }

  function closeDedicatedPage() {
    document.getElementById(PAGE_ID)?.remove();
    document.body.classList.remove("recent-updates-page-open");

    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = "/";
    }
  }

  function renderDedicatedListPage(config, keyword = "") {
    ensureStyles();

    const context = dedicatedContext();
    if (!context.view) return;

    let page = document.getElementById(PAGE_ID);
    if (!page) {
      page = document.createElement("section");
      page.id = PAGE_ID;
      page.className = "recent-updates-page";
      document.body.appendChild(page);
    }

    document.body.classList.add("recent-updates-page-open");

    const definition = pageDefinition(context, config);
    const query = normalize(keyword).toLowerCase();
    const allResources = resourcesForContext(context, config);

    const filtered = query
      ? allResources.filter((resource) => {
          const searchable = [
            resource.title,
            resource.artTitle,
            resource.category,
            resource.update,
            ...sourceLabels(resource, config)
          ].join(" ").toLowerCase();

          return searchable.includes(query);
        })
      : allResources;

    page.innerHTML = `
      <div class="recent-updates-page-shell">
        <header class="recent-updates-page-head">
          <button class="recent-updates-page-back" type="button"
            data-recent-page-back aria-label="返回">‹</button>
          <div class="recent-updates-page-title">
            <strong>${escapeHtml(definition.title)}</strong>
            <small>${escapeHtml(definition.subtitle)}</small>
          </div>
          <span></span>
        </header>

        <label class="recent-updates-page-search">
          <span>⌕</span>
          <input type="search" data-recent-page-search
            value="${escapeHtml(keyword)}"
            placeholder="${escapeHtml(definition.searchPlaceholder)}" />
        </label>

        <div class="recent-updates-page-card">
          <div class="recent-updates-page-summary">
            <strong>${escapeHtml(definition.summary)}</strong>
            <span>共 ${filtered.length} 条</span>
          </div>

          ${
            filtered.length
              ? `<div class="recent-updates-list">
                  ${filtered.map((resource, index) => (
                    dedicatedItemMarkup(resource, index, config, context)
                  )).join("")}
                </div>`
              : `<div class="recent-updates-page-empty">
                  当前页面没有符合条件的资源
                </div>`
          }
        </div>
      </div>
    `;

    page.querySelector("[data-recent-page-back]")?.addEventListener(
      "click",
      closeDedicatedPage
    );

    const searchInput = page.querySelector("[data-recent-page-search]");
    searchInput?.addEventListener("input", () => {
      const cursorPosition = searchInput.selectionStart || 0;
      renderDedicatedListPage(config, searchInput.value);

      const nextInput = document.querySelector("[data-recent-page-search]");
      nextInput?.focus();
      nextInput?.setSelectionRange(cursorPosition, cursorPosition);
    });
  }

  function normalizedSectionText(trigger) {
    const knownLabels = [
      "热门资源",
      "人气榜",
      "好评榜",
      "评分榜",
      "最近更新"
    ];

    let current = trigger;
    for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
      const headings = current.querySelectorAll?.(
        "h1,h2,h3,h4,.section-title,.panel-title,.card-title,[data-section-title]"
      );

      for (const heading of headings || []) {
        const textValue = normalize(heading.textContent);
        const matched = knownLabels.find((label) => textValue.includes(label));
        if (matched) return matched;
      }
    }

    return normalize(trigger.textContent);
  }

  function routeFromTrigger(trigger, config) {
    const triggerText = normalize(trigger.textContent);
    const sectionText = normalizedSectionText(trigger);
    const combined = `${sectionText} ${triggerText}`;

    if (/最近更新/.test(combined)) {
      return { view: "recent", value: "" };
    }
    if (/热门资源/.test(combined)) {
      return { view: "hot", value: "" };
    }
    if (/人气榜/.test(combined)) {
      return { view: "popular", value: "" };
    }
    if (/好评榜|评分榜/.test(combined)) {
      return { view: "rating", value: "" };
    }

    const categories = Array.isArray(config?.categoryOrder)
      ? config.categoryOrder.map(normalize).filter(Boolean)
      : [];

    const directCategory = categories.find((category) => triggerText === category);
    if (directCategory) {
      return { view: "category", value: directCategory };
    }

    const sources = Array.isArray(config?.sources)
      ? config.sources.map((source) => normalize(source.label)).filter(Boolean)
      : [];

    const directSource = sources.find((source) => triggerText === source);
    if (directSource && !/全部网盘/.test(directSource)) {
      return { view: "source", value: directSource };
    }

    const href = trigger.getAttribute?.("href");
    if (href) {
      try {
        const url = new URL(href, window.location.origin);
        const params = url.searchParams;

        const category = normalize(params.get("category"));
        if (category) return { view: "category", value: category };

        const source = normalize(params.get("source"));
        if (source) return { view: "source", value: source };

        const sort = normalize(params.get("sort")).toLowerCase();
        if (["hot", "popular"].includes(sort)) return { view: "popular", value: "" };
        if (["rating", "score"].includes(sort)) return { view: "rating", value: "" };
        if (["recent", "new", "latest"].includes(sort)) return { view: "recent", value: "" };
      } catch {
        // Ignore malformed links.
      }
    }

    return null;
  }

  function dedicatedUrl(route) {
    const params = new URLSearchParams({ view: route.view });
    if (route.value) params.set("value", route.value);
    return `/search.html?${params.toString()}`;
  }

  function directFilterRoute(trigger, config) {
    const textValue = normalize(trigger.textContent);

    if (textValue === "评分" || textValue === "好评榜" || textValue === "评分榜") {
      return { view: "rating", value: "" };
    }

    if (textValue === "最热" || textValue === "人气榜") {
      return { view: "popular", value: "" };
    }

    if (textValue === "最近更新") {
      return { view: "recent", value: "" };
    }

    const categories = Array.isArray(config?.categoryOrder)
      ? config.categoryOrder.map(normalize).filter(Boolean)
      : [];

    if (
      textValue
      && textValue !== "全部分类"
      && categories.includes(textValue)
    ) {
      return { view: "category", value: textValue };
    }

    const sources = Array.isArray(config?.sources)
      ? config.sources.map((source) => normalize(source.label)).filter(Boolean)
      : [];

    if (
      textValue
      && textValue !== "全部网盘"
      && sources.includes(textValue)
    ) {
      return { view: "source", value: textValue };
    }

    return null;
  }

  function installUnifiedNavigation() {
    // 保留原系统的默认、最热、评分、年份、分类和网盘切换逻辑。
    // 这里只处理首页“最近更新”的查看更多按钮，该按钮已有独立事件。
  }


  function configuredResourceMap(config) {
    return new Map(
      (Array.isArray(config?.resources) ? config.resources : [])
        .map((resource) => [String(resource.id), resource])
    );
  }

  function smallestHeatElement(card) {
    const candidates = [...card.querySelectorAll("span,small,em,strong,p,div")]
      .filter((element) => normalize(element.textContent).includes("🔥"))
      .filter((element) => ![...element.children].some(
        (child) => normalize(child.textContent).includes("🔥")
      ))
      .sort((left, right) => (
        normalize(left.textContent).length - normalize(right.textContent).length
      ));

    return candidates[0] || null;
  }

  function originalHeatText(element) {
    if (element.dataset.originalHeatText) {
      return element.dataset.originalHeatText;
    }

    let value = normalize(element.textContent);

    // Remove rating text written by older fixes while preserving heat.
    value = value
      .replace(/^⭐\s*\d+(?:\.\d+)?\s*/u, "")
      .replace(/^★\s*\d+(?:\.\d+)?\s*/u, "")
      .trim();

    const heatIndex = value.indexOf("🔥");
    if (heatIndex >= 0) value = value.slice(heatIndex);

    element.dataset.originalHeatText = value;
    return value;
  }

  function applyRatingsBeforeHeat(config) {
    if (!config) return;

    // Remove old extra rating nodes that previously broke the card layout.
    document.querySelectorAll(
      "[data-configured-rating],.configured-rating-value"
    ).forEach((element) => element.remove());

    const resources = configuredResourceMap(config);

    document.querySelectorAll("[data-resource-id]").forEach((target) => {
      const resource = resources.get(String(target.dataset.resourceId || ""));
      if (!resource) return;

      const card = target.closest(
        "button,article,li,.resource-card,.resource-item,.recent-update-item"
      ) || target;

      const heatElement = smallestHeatElement(card);
      if (!heatElement) return;

      const heatText = originalHeatText(heatElement);
      if (!heatText.includes("🔥")) return;

      const rating = Math.max(
        0,
        Math.min(10, Number(resource.rating) || 0)
      );

      heatElement.textContent = `⭐ ${rating.toFixed(1)}　${heatText}`;
      heatElement.dataset.ratingBeforeHeat = "true";
      heatElement.style.whiteSpace = "nowrap";
    });
  }

  let ratingApplyTimer = null;

  function scheduleRatingsBeforeHeat(config) {
    clearTimeout(ratingApplyTimer);
    ratingApplyTimer = setTimeout(
      () => applyRatingsBeforeHeat(config),
      60
    );
  }

  async function refreshPublic() {
    try {
      const nextConfig = await fetchConfig(false);
      currentConfig = nextConfig;

      if (isDedicatedListPage()) {
        renderDedicatedListPage(currentConfig);
      } else {
        renderPublic(currentConfig);
      }

      scheduleRatingsBeforeHeat(currentConfig);
    } catch {
      // Keep the existing page during a temporary wake-up/network error.
    }
  }

  function startPublic() {
    refreshPublic();

    const nativeListObserver = new MutationObserver(() => {
      if (currentConfig) scheduleRatingsBeforeHeat(currentConfig);
    });

    nativeListObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    window.addEventListener("popstate", () => {
      document.getElementById(SECTION_ID)?.remove();
      refreshPublic();
    });

    installUnifiedNavigation();

    if (!isDedicatedListPage()) {
      const observer = new MutationObserver(() => {
        if (
          currentConfig
          && isHomepageOnly()
          && !document.getElementById(SECTION_ID)
        ) {
          clearTimeout(publicTimer);
          publicTimer = setTimeout(() => renderPublic(currentConfig), 100);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    setInterval(refreshPublic, 20000);
  }

  function start() {
    if (location.pathname.startsWith("/admin")) startAdmin();
    else startPublic();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
