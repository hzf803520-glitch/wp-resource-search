(() => {
  "use strict";

  const STYLE_ID = "resourceYearConfigStyles";
  const ADMIN_SECTION_ID = "resourceYearConfigSection";
  const YEAR_MIN = 1900;
  const YEAR_MAX = 2100;

  const nativeFetch = window.fetch.bind(window);
  let currentConfig = null;
  let yearValues = new Map();
  let yearDirty = false;
  let yearMode = false;
  let sortTimer = null;
  let adminRenderTimer = null;

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
    return normalize(init?.method || input?.method || "GET").toUpperCase();
  }

  function validYear(value) {
    const year = Math.trunc(Number(value) || 0);
    return year >= YEAR_MIN && year <= YEAR_MAX ? year : 0;
  }

  function resourceList(config) {
    return Array.isArray(config?.resources) ? config.resources : [];
  }

  function syncYearMap(config, preserveDirty = false) {
    if (!preserveDirty) yearValues = new Map();

    for (const resource of resourceList(config)) {
      const id = String(resource.id);
      if (!preserveDirty || !yearValues.has(id)) {
        yearValues.set(id, validYear(resource.year));
      }
    }
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ADMIN_SECTION_ID} {
        margin: 18px 0;
      }

      #${ADMIN_SECTION_ID} .year-config-toolbar {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 14px 0 12px;
      }

      #${ADMIN_SECTION_ID} .year-config-search {
        display: flex;
        flex: 1;
        align-items: center;
        gap: 8px;
        min-height: 42px;
        border: 1px solid rgba(120, 132, 148, .18);
        border-radius: 12px;
        padding: 0 12px;
        background: rgba(247, 249, 251, .95);
      }

      #${ADMIN_SECTION_ID} .year-config-search input {
        width: 100%;
        border: 0;
        outline: 0;
        background: transparent;
      }

      #${ADMIN_SECTION_ID} .year-config-count {
        flex: none;
        color: #8a94a2;
        font-size: 12px;
      }

      #${ADMIN_SECTION_ID} .year-config-list {
        display: grid;
        max-height: 440px;
        gap: 9px;
        overflow: auto;
        padding-right: 3px;
      }

      #${ADMIN_SECTION_ID} .year-config-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 118px;
        align-items: center;
        gap: 12px;
        min-height: 60px;
        border: 1px solid rgba(120, 132, 148, .14);
        border-radius: 13px;
        padding: 10px 12px;
        background: rgba(248, 250, 251, .92);
      }

      #${ADMIN_SECTION_ID} .year-resource-copy {
        min-width: 0;
      }

      #${ADMIN_SECTION_ID} .year-resource-copy strong,
      #${ADMIN_SECTION_ID} .year-resource-copy small {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      #${ADMIN_SECTION_ID} .year-resource-copy strong {
        color: #25303d;
        font-size: 14px;
      }

      #${ADMIN_SECTION_ID} .year-resource-copy small {
        margin-top: 4px;
        color: #8c96a3;
        font-size: 11px;
      }

      #${ADMIN_SECTION_ID} .year-input-wrap {
        display: grid;
        grid-template-columns: 32px minmax(0, 1fr);
        align-items: center;
        overflow: hidden;
        border: 1px solid rgba(120, 132, 148, .18);
        border-radius: 11px;
        background: #fff;
      }

      #${ADMIN_SECTION_ID} .year-input-wrap span {
        display: grid;
        height: 40px;
        place-items: center;
        background: #f1f5f7;
        font-size: 13px;
      }

      #${ADMIN_SECTION_ID} .year-input-wrap input {
        width: 100%;
        height: 40px;
        border: 0;
        outline: 0;
        padding: 0 9px;
        background: transparent;
        font-size: 14px;
        font-weight: 700;
      }

      #${ADMIN_SECTION_ID} .year-empty {
        border: 1px dashed rgba(120, 132, 148, .24);
        border-radius: 13px;
        padding: 24px 14px;
        color: #8b95a2;
        text-align: center;
      }

      @media (max-width: 640px) {
        #${ADMIN_SECTION_ID} .year-config-row {
          grid-template-columns: minmax(0, 1fr) 108px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function markDirty() {
    yearDirty = true;

    const status = document.getElementById("saveStatus");
    if (status) status.textContent = "有未保存更改";

    const button = document.getElementById("saveButton");
    if (button) {
      button.disabled = false;
      button.classList.add("has-changes");
    }
  }

  function markSaved() {
    yearDirty = false;

    const status = document.getElementById("saveStatus");
    if (status && /未保存|保存中/.test(status.textContent)) {
      status.textContent = "已同步";
    }
  }

  function applyYearsToPayload(payload) {
    if (!payload || !Array.isArray(payload.resources)) return payload;

    payload.resources = payload.resources.map((resource) => {
      const id = String(resource.id);
      return {
        ...resource,
        year: validYear(yearValues.get(id))
      };
    });

    return payload;
  }

  window.fetch = async function yearAwareFetch(input, init = {}) {
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
        const payload = applyYearsToPayload(JSON.parse(init.body));
        nextInit = {
          ...init,
          body: JSON.stringify(payload)
        };
      } catch {
        // Keep the original request if the body cannot be parsed.
      }
    }

    const response = await nativeFetch(input, nextInit);

    if (
      response.ok
      && ["/api/config", "/api/admin/config"].includes(path)
      && ["GET", "PUT"].includes(method)
    ) {
      response.clone().json().then((config) => {
        currentConfig = config;
        syncYearMap(config, method === "GET" && yearDirty);

        if (method === "PUT") markSaved();

        if (location.pathname.startsWith("/admin")) {
          scheduleAdminRender();
        } else if (yearMode) {
          scheduleYearSort();
        }
      }).catch(() => {});
    }

    return response;
  };

  function adminSectionMarkup(config) {
    const rows = resourceList(config).map((resource) => {
      const id = String(resource.id);
      const value = validYear(yearValues.get(id));

      return `
        <label class="year-config-row"
          data-year-row
          data-year-search="${escapeHtml(`${resource.title} ${resource.category}`.toLowerCase())}">
          <span class="year-resource-copy">
            <strong>${escapeHtml(resource.title || "未命名资源")}</strong>
            <small>${escapeHtml(resource.category || "未分类")} · 资源ID ${escapeHtml(id)}</small>
          </span>
          <span class="year-input-wrap">
            <span>年</span>
            <input
              type="number"
              inputmode="numeric"
              min="${YEAR_MIN}"
              max="${YEAR_MAX}"
              step="1"
              placeholder="如 2026"
              value="${value || ""}"
              data-resource-year="${escapeHtml(id)}"
            />
          </span>
        </label>
      `;
    }).join("");

    return `
      <div class="section-title">
        <div>
          <h3>资源年份配置</h3>
          <p>填写资源所属年份，例如 2026。前台点击“年份”后会按最新年份优先排列，未填写的排在最后。</p>
        </div>
      </div>

      <div class="year-config-toolbar">
        <label class="year-config-search">
          <span>⌕</span>
          <input type="search" placeholder="搜索资源名称或分类" data-year-search-input />
        </label>
        <span class="year-config-count" data-year-count>共 ${resourceList(config).length} 条</span>
      </div>

      <div class="year-config-list" data-year-list>
        ${rows || '<div class="year-empty">暂无资源，请先新增资源并保存。</div>'}
      </div>
    `;
  }

  function bindAdminSection(section) {
    section.querySelectorAll("[data-resource-year]").forEach((input) => {
      input.addEventListener("input", () => {
        const id = String(input.dataset.resourceYear || "");
        const raw = normalize(input.value);

        if (!raw) {
          yearValues.set(id, 0);
          input.setCustomValidity("");
          markDirty();
          return;
        }

        const year = validYear(raw);
        if (!year) {
          input.setCustomValidity(`年份需填写 ${YEAR_MIN}-${YEAR_MAX}`);
        } else {
          input.setCustomValidity("");
          yearValues.set(id, year);
        }

        markDirty();
      });
    });

    const search = section.querySelector("[data-year-search-input]");
    const count = section.querySelector("[data-year-count]");

    search?.addEventListener("input", () => {
      const keyword = normalize(search.value).toLowerCase();
      let visible = 0;

      section.querySelectorAll("[data-year-row]").forEach((row) => {
        const matched = !keyword || String(row.dataset.yearSearch || "").includes(keyword);
        row.hidden = !matched;
        if (matched) visible += 1;
      });

      if (count) count.textContent = `显示 ${visible} 条`;
    });
  }

  function renderAdminSection() {
    if (!location.pathname.startsWith("/admin") || !currentConfig) return;

    const host = document.getElementById("resourcePanel");
    const resourcesEditor = document.getElementById("resourcesEditor");
    if (!host || !resourcesEditor) return;

    addStyles();

    let section = document.getElementById(ADMIN_SECTION_ID);
    if (!section) {
      section = document.createElement("div");
      section.id = ADMIN_SECTION_ID;
      section.className = "editor-section";
      resourcesEditor.insertAdjacentElement("beforebegin", section);
    }

    section.innerHTML = adminSectionMarkup(currentConfig);
    bindAdminSection(section);
  }

  function scheduleAdminRender() {
    clearTimeout(adminRenderTimer);
    adminRenderTimer = setTimeout(renderAdminSection, 100);
  }

  function closestResourceCard(node) {
    return node.closest(
      "button,article,li,.resource-card,.resource-item,.result-card,.search-result-item"
    ) || node;
  }

  function collectCards() {
    const unique = new Map();

    document.querySelectorAll("[data-resource-id]").forEach((node) => {
      const id = String(node.dataset.resourceId || "");
      if (!id) return;

      const card = closestResourceCard(node);
      if (!card?.parentElement) return;

      if (!unique.has(card)) {
        unique.set(card, { card, id });
      }
    });

    return [...unique.values()];
  }

  function updateRank(card, rank) {
    const candidates = [
      card.querySelector("[class*='rank']"),
      card.querySelector("[class*='index']"),
      card.querySelector("[class*='number']")
    ].filter(Boolean);

    const target = candidates.find((element) => /^\d+$/.test(normalize(element.textContent)));
    if (target) target.textContent = String(rank);
  }

  function applyYearSort() {
    if (!yearMode || !currentConfig) return;

    const resources = new Map(
      resourceList(currentConfig).map((resource, index) => [
        String(resource.id),
        {
          year: validYear(resource.year),
          updatedAt: Date.parse(resource.updatedAt || "") || 0,
          id: Number(resource.id) || 0,
          index
        }
      ])
    );

    const groups = new Map();

    for (const entry of collectCards()) {
      const parent = entry.card.parentElement;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push(entry);
    }

    for (const [parent, entries] of groups) {
      if (entries.length < 2) continue;

      entries.sort((left, right) => {
        const a = resources.get(left.id) || { year: 0, updatedAt: 0, id: 0, index: 0 };
        const b = resources.get(right.id) || { year: 0, updatedAt: 0, id: 0, index: 0 };

        if (b.year !== a.year) return b.year - a.year;
        if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
        if (b.id !== a.id) return b.id - a.id;
        return a.index - b.index;
      });

      entries.forEach((entry, index) => {
        parent.appendChild(entry.card);
        updateRank(entry.card, index + 1);
      });
    }
  }

  function scheduleYearSort() {
    clearTimeout(sortTimer);
    sortTimer = setTimeout(applyYearSort, 80);
  }

  function sortButtonText(target) {
    const button = target.closest("button,[role='button'],a");
    return {
      button,
      text: normalize(button?.textContent)
    };
  }

  function installPublicYearSort() {
    document.addEventListener("click", (event) => {
      const { button, text } = sortButtonText(event.target);
      if (!button) return;

      if (text === "年份") {
        yearMode = true;
        scheduleYearSort();
        setTimeout(scheduleYearSort, 180);
        setTimeout(scheduleYearSort, 450);
        return;
      }

      if (["默认", "最热", "评分"].includes(text)) {
        yearMode = false;
      }
    });

    const observer = new MutationObserver(() => {
      if (yearMode) scheduleYearSort();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  async function loadConfig() {
    const path = location.pathname.startsWith("/admin")
      ? "/api/admin/config"
      : "/api/config";

    try {
      const response = await nativeFetch(path, {
        credentials: "same-origin",
        cache: "no-store"
      });

      if (!response.ok) return;

      currentConfig = await response.json();
      syncYearMap(currentConfig);

      if (location.pathname.startsWith("/admin")) {
        scheduleAdminRender();
      }
    } catch {
      // The main page remains usable if this optional module cannot load.
    }
  }

  window.addEventListener("beforeunload", (event) => {
    if (!yearDirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      loadConfig();
      if (!location.pathname.startsWith("/admin")) installPublicYearSort();
    }, { once: true });
  } else {
    loadConfig();
    if (!location.pathname.startsWith("/admin")) installPublicYearSort();
  }
})();
