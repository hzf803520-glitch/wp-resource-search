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

  let currentConfig = null;
  let expanded = false;
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

  function timestamp(resource, config) {
    const value = Date.parse(resource?.updatedAt || config?.meta?.updatedAt || "");
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
      .filter((resource) => resource?.visible !== false)
      .map((resource, index) => ({ resource, index }))
      .sort((left, right) => {
        const timeDifference = timestamp(right.resource, config) - timestamp(left.resource, config);
        if (timeDifference !== 0) return timeDifference;

        const rightId = Number(right.resource.id) || 0;
        const leftId = Number(left.resource.id) || 0;
        if (rightId !== leftId) return rightId - leftId;

        return right.index - left.index;
      })
      .map(({ resource }) => resource);
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
        width: calc(100% - 24px);
        max-width: 520px;
        box-sizing: border-box;
        margin: 12px auto;
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
      .recent-update-arrow {
        color: #aab0b8;
        font-size: 22px;
        font-weight: 300;
        line-height: 1;
        text-align: center;
      }
      @media (max-width: 430px) {
        .recent-updates-section {
          width: calc(100% - 18px);
          padding: 14px 10px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function findPlacementTarget() {
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
    const date = formatDate(timestamp(resource, config));

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

  function renderPublic(config) {
    document.getElementById(SECTION_ID)?.remove();

    const values = valuesFromConfig(config);
    if (values.enabled !== "show") return;

    const resources = recentResources(config);
    if (!resources.length) return;

    ensureStyles();

    const displayed = expanded ? resources : resources.slice(0, values.limit);
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
                ${escapeHtml(expanded ? "收起" : values.moreText)} ›
              </button>`
            : ""
        }
      </div>
      <div class="recent-updates-list">
        ${displayed.map((resource, index) => itemMarkup(resource, index, config)).join("")}
      </div>
    `;

    section.querySelector("[data-recent-updates-more]")?.addEventListener("click", () => {
      expanded = !expanded;
      renderPublic(config);
      document.getElementById(SECTION_ID)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
      });
    });

    const placement = findPlacementTarget();
    if (placement.before) {
      placement.parent.insertBefore(section, placement.before);
    } else {
      placement.parent.appendChild(section);
    }
  }

  async function refreshPublic() {
    try {
      const nextConfig = await fetchConfig(false);
      currentConfig = nextConfig;
      renderPublic(currentConfig);
    } catch {
      // Keep the existing section during a temporary wake-up/network error.
    }
  }

  function startPublic() {
    refreshPublic();

    const observer = new MutationObserver(() => {
      if (currentConfig && !document.getElementById(SECTION_ID)) {
        clearTimeout(publicTimer);
        publicTimer = setTimeout(() => renderPublic(currentConfig), 100);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

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
