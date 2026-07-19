(() => {
  "use strict";

  const STYLE_ID = "resourceYearInlineStyles";
  const OLD_SECTION_ID = "resourceYearConfigSection";
  const YEAR_MIN = 1900;
  const YEAR_MAX = 2100;

  const wrappedFetch = window.fetch.bind(window);

  let currentConfig = null;
  let yearValues = new Map();
  let yearMode = false;
  let yearDirty = false;
  let renderTimer = null;
  let sortTimer = null;

  function normalize(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
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

  function resources(config) {
    return Array.isArray(config?.resources) ? config.resources : [];
  }

  function syncYearValues(config, preserveDirty = false) {
    const next = preserveDirty ? new Map(yearValues) : new Map();

    resources(config).forEach((resource) => {
      const key = String(resource.id);
      if (!preserveDirty || !next.has(key)) {
        next.set(key, validYear(resource.year));
      }
    });

    yearValues = next;
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .resource-rating-year-row {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) 155px;
        align-items: stretch;
        gap: 10px;
        width: 100%;
      }

      .resource-rating-year-row > input {
        min-width: 0;
        width: 100% !important;
      }

      .resource-inline-year-shell {
        display: grid;
        grid-template-columns: 48px minmax(0, 1fr);
        align-items: center;
        min-width: 0;
        overflow: hidden;
        border: 1px solid rgba(126, 139, 157, .22);
        border-radius: 10px;
        background: #fff;
      }

      .resource-inline-year-prefix {
        display: grid;
        height: 100%;
        min-height: 44px;
        place-items: center;
        border-right: 1px solid rgba(126, 139, 157, .15);
        color: #687484;
        background: #f3f6f8;
        font-size: 13px;
        font-weight: 700;
      }

      .resource-inline-year-input {
        width: 100% !important;
        min-width: 0;
        height: 100% !important;
        min-height: 44px;
        border: 0 !important;
        border-radius: 0 !important;
        outline: 0;
        padding: 0 10px !important;
        background: transparent !important;
        box-shadow: none !important;
        color: #27313d;
        font-size: 14px;
        font-weight: 700;
      }

      .resource-inline-year-input:invalid {
        color: #d74d4d;
      }

      @media (max-width: 760px) {
        .resource-rating-year-row {
          grid-template-columns: minmax(0, 1fr) 132px;
          gap: 8px;
        }

        .resource-inline-year-shell {
          grid-template-columns: 42px minmax(0, 1fr);
        }
      }

      @media (max-width: 520px) {
        .resource-rating-year-row {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function markDirty() {
    yearDirty = true;

    const status = document.getElementById("saveStatus");
    if (status) status.textContent = "有未保存更改";

    const button =
      document.getElementById("saveButton")
      || document.querySelector("[data-save-config]")
      || [...document.querySelectorAll("button")].find(
        (item) => /保存并发布|保存/.test(normalize(item.textContent))
      );

    if (button) {
      button.disabled = false;
      button.classList.add("has-changes");
    }
  }

  function markSaved() {
    yearDirty = false;

    const status = document.getElementById("saveStatus");
    if (status && /未保存|保存中/.test(normalize(status.textContent))) {
      status.textContent = "已同步";
    }
  }

  function resourceCards() {
    const editor = document.getElementById("resourcesEditor");
    if (!editor) return [];

    const directChildren = [...editor.children].filter(
      (element) => element.nodeType === 1
    );

    if (directChildren.length) return directChildren;

    return [...editor.querySelectorAll(
      ".resource-editor-card,.resource-editor-item,.editor-section"
    )];
  }

  function labelText(label) {
    const firstText = [...label.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => normalize(node.textContent))
      .join(" ");

    const caption =
      label.querySelector(":scope > span")
      || label.querySelector(":scope > strong")
      || label.querySelector(":scope > div");

    return normalize(firstText || caption?.textContent || label.textContent);
  }

  function findRatingLabel(card) {
    const labels = [...card.querySelectorAll("label")];

    return labels.find((label) => {
      if (!/评分/.test(labelText(label))) return false;

      const input = label.querySelector(
        "input[type='number'],input[data-field='rating'],input[name*='rating']"
      );

      return Boolean(input);
    }) || null;
  }

  function titleInput(card) {
    const labels = [...card.querySelectorAll("label")];

    for (const label of labels) {
      if (!/列表完整标题|完整标题|资源标题/.test(labelText(label))) continue;
      const input = label.querySelector("input,textarea");
      if (input) return input;
    }

    return card.querySelector(
      "input[data-field='title'],input[name*='title'],textarea[name*='title']"
    );
  }

  function cardResourceId(card, index) {
    const direct =
      card.dataset.resourceId
      || card.querySelector("[data-resource-id]")?.dataset.resourceId
      || card.querySelector("[data-id]")?.dataset.id;

    if (direct !== undefined && direct !== null && direct !== "") {
      return String(direct);
    }

    const title = normalize(titleInput(card)?.value);
    const matching = resources(currentConfig).find(
      (resource) => normalize(resource.title) === title
    );

    if (matching) return String(matching.id);

    const byIndex = resources(currentConfig)[index];
    return byIndex ? String(byIndex.id) : "";
  }

  function inputYearValue(resourceId, index) {
    if (resourceId && yearValues.has(resourceId)) {
      return validYear(yearValues.get(resourceId));
    }

    return validYear(resources(currentConfig)[index]?.year);
  }

  function createYearShell(resourceId, index) {
    const shell = document.createElement("span");
    shell.className = "resource-inline-year-shell";
    shell.dataset.inlineYearShell = "true";

    const prefix = document.createElement("span");
    prefix.className = "resource-inline-year-prefix";
    prefix.textContent = "年份";

    const input = document.createElement("input");
    input.className = "resource-inline-year-input";
    input.type = "number";
    input.inputMode = "numeric";
    input.min = String(YEAR_MIN);
    input.max = String(YEAR_MAX);
    input.step = "1";
    input.placeholder = "如 2026";
    input.autocomplete = "off";
    input.dataset.resourceYear = resourceId;
    input.dataset.resourceIndex = String(index);

    const currentYear = inputYearValue(resourceId, index);
    input.value = currentYear ? String(currentYear) : "";

    input.addEventListener("input", () => {
      const raw = normalize(input.value);

      if (!raw) {
        input.setCustomValidity("");
        if (resourceId) yearValues.set(resourceId, 0);
        markDirty();
        return;
      }

      const year = validYear(raw);

      if (!year) {
        input.setCustomValidity(`年份需填写 ${YEAR_MIN}-${YEAR_MAX}`);
      } else {
        input.setCustomValidity("");
        if (resourceId) yearValues.set(resourceId, year);
      }

      markDirty();
    });

    shell.append(prefix, input);
    return shell;
  }

  function injectInlineYearFields() {
    if (!location.pathname.startsWith("/admin") || !currentConfig) return;

    addStyles();

    // Remove the previous separate year configuration section.
    document.getElementById(OLD_SECTION_ID)?.remove();

    resourceCards().forEach((card, index) => {
      const ratingLabel = findRatingLabel(card);
      if (!ratingLabel) return;

      const resourceId = cardResourceId(card, index);
      if (resourceId) card.dataset.yearResourceId = resourceId;

      const existingShell = ratingLabel.querySelector("[data-inline-year-shell]");
      if (existingShell) {
        const existingInput = existingShell.querySelector(".resource-inline-year-input");

        if (existingInput) {
          existingInput.dataset.resourceYear = resourceId;
          existingInput.dataset.resourceIndex = String(index);

          const savedYear = inputYearValue(resourceId, index);

          if (
            document.activeElement !== existingInput
            && !yearDirty
          ) {
            existingInput.value = savedYear ? String(savedYear) : "";
          }
        }

        return;
      }

      const ratingInput = ratingLabel.querySelector(
        "input[type='number'],input[data-field='rating'],input[name*='rating']"
      );

      if (!ratingInput) return;

      const row = document.createElement("span");
      row.className = "resource-rating-year-row";
      row.dataset.ratingYearRow = "true";

      ratingInput.parentNode.insertBefore(row, ratingInput);
      row.appendChild(ratingInput);
      row.appendChild(createYearShell(resourceId, index));
    });
  }

  function scheduleInlineRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(injectInlineYearFields, 80);
  }

  function collectYearsFromEditor() {
    const byIndex = new Map();

    document.querySelectorAll(".resource-inline-year-input").forEach((input) => {
      const year = validYear(input.value);
      const resourceId = normalize(input.dataset.resourceYear);
      const index = Number(input.dataset.resourceIndex);

      if (resourceId) yearValues.set(resourceId, year);
      if (Number.isInteger(index) && index >= 0) byIndex.set(index, year);
    });

    return byIndex;
  }

  function applyYearsToPayload(payload) {
    if (!payload || !Array.isArray(payload.resources)) return payload;

    const byIndex = collectYearsFromEditor();

    payload.resources = payload.resources.map((resource, index) => {
      const resourceId = String(resource.id ?? "");
      let year = resourceId && yearValues.has(resourceId)
        ? validYear(yearValues.get(resourceId))
        : validYear(byIndex.get(index));

      return {
        ...resource,
        year
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
        // Keep the original request when the body is not JSON.
      }
    }

    const response = await wrappedFetch(input, nextInit);

    if (
      response.ok
      && ["/api/config", "/api/admin/config"].includes(path)
      && ["GET", "PUT"].includes(method)
    ) {
      response.clone().json().then((payload) => {
        const savedConfig = unwrapConfig(payload);

        if (!savedConfig || !Array.isArray(savedConfig.resources)) {
          return;
        }

        currentConfig = savedConfig;
        syncYearValues(
          savedConfig,
          method === "GET" && yearDirty
        );

        if (method === "PUT") {
          markSaved();
        }

        if (location.pathname.startsWith("/admin")) {
          scheduleInlineRender();
        } else if (yearMode) {
          scheduleYearSort();
        }
      }).catch(() => {});
    }

    return response;
  };

  function closestResourceCard(node) {
    return node.closest(
      "button,article,li,.resource-card,.resource-item,.result-card,.search-result-item"
    ) || node;
  }

  function collectPublicCards() {
    const unique = new Map();

    document.querySelectorAll("[data-resource-id]").forEach((node) => {
      const id = String(node.dataset.resourceId || "");
      if (!id) return;

      const card = closestResourceCard(node);
      if (!card?.parentElement) return;

      if (!unique.has(card)) unique.set(card, { card, id });
    });

    return [...unique.values()];
  }

  function updateRank(card, rank) {
    const candidates = [
      card.querySelector("[class*='rank']"),
      card.querySelector("[class*='index']"),
      card.querySelector("[class*='number']")
    ].filter(Boolean);

    const target = candidates.find(
      (element) => /^\d+$/.test(normalize(element.textContent))
    );

    if (target) target.textContent = String(rank);
  }

  function applyYearSort() {
    if (!yearMode || !currentConfig) return;

    const metadata = new Map(
      resources(currentConfig).map((resource, index) => [
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

    collectPublicCards().forEach((entry) => {
      const parent = entry.card.parentElement;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push(entry);
    });

    groups.forEach((entries, parent) => {
      if (entries.length < 2) return;

      entries.sort((left, right) => {
        const a = metadata.get(left.id) || {
          year: 0, updatedAt: 0, id: 0, index: 0
        };
        const b = metadata.get(right.id) || {
          year: 0, updatedAt: 0, id: 0, index: 0
        };

        if (b.year !== a.year) return b.year - a.year;
        if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
        if (b.id !== a.id) return b.id - a.id;
        return a.index - b.index;
      });

      entries.forEach((entry, index) => {
        parent.appendChild(entry.card);
        updateRank(entry.card, index + 1);
      });
    });
  }

  function scheduleYearSort() {
    clearTimeout(sortTimer);
    sortTimer = setTimeout(applyYearSort, 90);
  }

  function installPublicSort() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest("button,[role='button'],a");
      if (!button) return;

      const text = normalize(button.textContent);

      if (text === "年份") {
        yearMode = true;
        scheduleYearSort();
        setTimeout(scheduleYearSort, 220);
        setTimeout(scheduleYearSort, 520);
      } else if (["默认", "最热", "评分"].includes(text)) {
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
      const response = await wrappedFetch(path, {
        credentials: "same-origin",
        cache: "no-store"
      });

      if (!response.ok) return;

      const payload = await response.json();
      currentConfig = unwrapConfig(payload);

      if (!currentConfig || !Array.isArray(currentConfig.resources)) {
        return;
      }

      syncYearValues(currentConfig);

      if (location.pathname.startsWith("/admin")) {
        scheduleInlineRender();
      }
    } catch {
      // Keep the main system usable if this optional module cannot load.
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

      if (location.pathname.startsWith("/admin")) {
        const observer = new MutationObserver(scheduleInlineRender);
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      } else {
        installPublicSort();
      }
    }, { once: true });
  } else {
    loadConfig();

    if (location.pathname.startsWith("/admin")) {
      const observer = new MutationObserver(scheduleInlineRender);
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    } else {
      installPublicSort();
    }
  }
})();
