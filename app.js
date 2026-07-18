let config = null;
let resources = [];
let categories = [];
let sources = [];

const state = {
  currentResource: null,
  currentProvider: null,
  selectedCategory: null,
  selectedSource: null,
  toastTimer: null
};

const els = {
  brandLogo: document.querySelector("#brandLogo"),
  brandTitle: document.querySelector("#brandTitle"),
  searchTitle: document.querySelector("#search-title"),
  searchSubtitle: document.querySelector("#searchSubtitle"),
  searchLabel: document.querySelector("#searchLabel"),
  searchForm: document.querySelector("#searchForm"),
  searchInput: document.querySelector("#searchInput"),
  searchButton: document.querySelector("#searchButton"),
  sourceChips: document.querySelector("#sourceChips"),
  categoryTabs: document.querySelector("#categoryTabs"),
  resultSection: document.querySelector("#resultSection"),
  resultTitle: document.querySelector("#resultTitle"),
  resultGrid: document.querySelector("#resultGrid"),
  emptyState: document.querySelector("#emptyState"),
  emptyTitle: document.querySelector("#emptyTitle"),
  emptyDescription: document.querySelector("#emptyDescription"),
  clearFilter: document.querySelector("#clearFilter"),
  hotTitle: document.querySelector("#hot-title"),
  popularTitle: document.querySelector("#popular-title"),
  ratingTitle: document.querySelector("#rating-title"),
  hotList: document.querySelector("#hotList"),
  popularGrid: document.querySelector("#popularGrid"),
  ratingGrid: document.querySelector("#ratingGrid"),
  footerText: document.querySelector("#footerText"),
  modal: document.querySelector("#resourceModal"),
  modalTitle: document.querySelector("#modal-title"),
  modalSuccess: document.querySelector("#modalSuccess"),
  modalResourceName: document.querySelector("#modalResourceName"),
  providerTabs: document.querySelector("#providerTabs"),
  activeProvider: document.querySelector("#activeProvider"),
  modalLinkStatus: document.querySelector("#modalLinkStatus"),
  linkValue: document.querySelector("#linkValue"),
  modalTip: document.querySelector("#modalTip"),
  copyLink: document.querySelector("#copyLink"),
  openLink: document.querySelector("#openLink"),
  closeModal: document.querySelector("#closeModal"),
  toast: document.querySelector("#toast"),
  themeColorMeta: document.querySelector("#themeColorMeta")
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setting(key, fallback = "") {
  return config?.settings?.[key] || fallback;
}

function normalizeCategory(value) {
  return String(value || "").trim();
}

function isCategory(resource, category) {
  return normalizeCategory(resource?.category) === normalizeCategory(category);
}

function getSource(id) {
  return sources.find((source) => source.id === id);
}

function getResourceLink(resource, sourceId) {
  const source = getSource(sourceId);
  return resource?.links?.[sourceId] || source?.defaultLink || "";
}

function applyThemeAndText() {
  const root = document.documentElement;
  root.style.setProperty("--accent", config.theme?.accent || "#ff725f");
  root.style.setProperty("--accent-2", config.theme?.accentSecondary || "#ff8a59");
  root.style.setProperty("--page", config.theme?.pageBackground || "#eaf8fa");
  els.themeColorMeta.content = config.theme?.pageBackground || "#eaf8fa";
  document.title = setting("pageTitle", "网盘资源搜索");
  els.brandLogo.textContent = setting("logoText", "WP");
  els.brandTitle.textContent = setting("brandTitle", "网盘资源搜索");
  els.searchTitle.textContent = setting("heroTitle", "网盘资源搜索");
  els.searchSubtitle.textContent = setting("heroSubtitle", "聚合多个网盘来源，快速找到可用链接");
  els.searchLabel.textContent = setting("searchAriaLabel", "搜索资源");
  els.searchInput.placeholder = setting("searchPlaceholder", "搜索：片名 / 关键词 / 主演 / 资源名称");
  els.searchButton.textContent = setting("searchButton", "搜索");
  els.resultTitle.textContent = setting("resultDefaultTitle", "搜索结果");
  els.clearFilter.textContent = setting("backToHot", "返回热门");
  els.emptyTitle.textContent = setting("emptyTitle", "没有找到相关资源");
  els.emptyDescription.textContent = setting("emptyDescription", "换个关键词或分类再试试");
  els.hotTitle.textContent = setting("hotTitle", "🔥 热门资源");
  els.popularTitle.textContent = setting("popularTitle", "🏆 人气榜");
  els.ratingTitle.textContent = setting("ratingTitle", "⭐ 好评榜");
  document.querySelectorAll("[data-view-more]").forEach((element) => {
    element.textContent = setting("viewMore", "查看更多");
  });
  els.footerText.textContent = setting("footerText", "本站为界面与交互演示，请仅添加你拥有授权的公开资源。");
  els.modalTitle.textContent = setting("modalTitle", "资源链接");
  els.modalSuccess.textContent = setting("modalSuccess", "获取成功!");
  els.modalLinkStatus.textContent = setting("modalLinkStatus", "资源链接 · 演示");
  els.modalTip.textContent = setting("modalTip", "请点击对应网盘按钮复制或打开链接");
  els.copyLink.textContent = setting("copyButton", "复制链接");
  els.openLink.textContent = setting("openButton", "打开链接");
  els.closeModal.textContent = setting("closeButton", "关闭");
}

function renderSourceChips() {
  els.sourceChips.innerHTML = sources.map((source) => (
    `<button type="button" data-source="${escapeHtml(source.id)}">${escapeHtml(source.label)}</button>`
  )).join("");
}

function renderCategories() {
  els.categoryTabs.innerHTML = categories.map((category) => {
    const count = resources.filter((item) => isCategory(item, category)).length;
    return `<button type="button" data-category="${escapeHtml(category)}">${escapeHtml(category)} <small>${count}</small></button>`;
  }).join("");
}

function resourceBadges(resource) {
  const badges = Object.keys(resource.links || {}).map((sourceId) => {
    const source = getSource(sourceId);
    return source ? `<span class="badge">${escapeHtml(source.label)}</span>` : "";
  }).join("");
  return `${badges}<span>🔥 ${Number(resource.heat) || 0}</span>`;
}

function posterMarkup(resource, rank) {
  const colors = Array.isArray(resource.colors) ? resource.colors : ["#26354f", "#7786a5"];
  const image = resource.image ? `<img class="poster-img" src="${escapeHtml(resource.image)}" alt="${escapeHtml(resource.artTitle || resource.title)}" loading="lazy" />` : "";
  return `
    <button class="poster-card" type="button" data-resource-id="${resource.id}" aria-label="查看${escapeHtml(resource.title)}资源">
      <span class="poster-art" style="--p1:${escapeHtml(colors[0])};--p2:${escapeHtml(colors[1])}">
        ${image}
        ${rank ? `<span class="poster-rank">${escapeHtml(setting("rankPrefix", "TOP"))}${rank}</span>` : ""}
      </span>
      <span class="poster-name">${escapeHtml(resource.title)}</span>
    </button>
  `;
}

function renderHome() {
  const hot = [...resources].sort((a, b) => Number(b.heat) - Number(a.heat));
  els.hotList.innerHTML = hot.slice(0, 9).map((resource, index) => `
    <li class="hot-item">
      <button type="button" data-resource-id="${resource.id}" aria-label="查看${escapeHtml(resource.title)}资源">
        <span class="rank-number">${index + 1}</span>
        <span class="hot-info">
          <span class="hot-title">${escapeHtml(resource.title)}</span>
          <span class="badges">${resourceBadges(resource)}</span>
        </span>
        <span class="hot-open" aria-hidden="true">›</span>
      </button>
    </li>
  `).join("");

  els.popularGrid.innerHTML = hot.slice(0, 9).map((resource, index) => posterMarkup(resource, index + 1)).join("");
  const topRated = [...resources].sort((a, b) => Number(b.rating) - Number(a.rating));
  els.ratingGrid.innerHTML = topRated.slice(0, 9).map((resource, index) => posterMarkup(resource, index + 1)).join("");
}

function renderResults(items, title) {
  els.resultTitle.textContent = title;
  els.resultSection.hidden = false;
  els.resultGrid.innerHTML = items.map((resource, index) => posterMarkup(resource, index + 1)).join("");
  els.emptyState.hidden = items.length !== 0;
  els.resultGrid.hidden = items.length === 0;
  window.setTimeout(() => els.resultSection.scrollIntoView({ behavior: "smooth", block: "start" }), 20);
}

function clearFilters() {
  state.selectedCategory = null;
  state.selectedSource = null;
  els.searchInput.value = "";
  els.resultSection.hidden = true;
  document.querySelectorAll(".category-tabs button, .source-chips button").forEach((button) => button.classList.remove("active"));
  document.querySelector(".hot-section").scrollIntoView({ behavior: "smooth", block: "start" });
}

function applySearch() {
  const query = els.searchInput.value.trim().toLowerCase();
  const items = resources.filter((resource) => {
    const sourceLabels = Object.keys(resource.links || {}).map((id) => getSource(id)?.label || "");
    const haystack = [resource.title, resource.artTitle, resource.category, resource.update, ...sourceLabels].join(" ").toLowerCase();
    return (!query || haystack.includes(query))
      && (!state.selectedCategory || isCategory(resource, state.selectedCategory))
      && (!state.selectedSource || Boolean(resource.links?.[state.selectedSource]));
  });

  const parts = [];
  if (query) parts.push(`“${els.searchInput.value.trim()}”`);
  if (state.selectedCategory) parts.push(state.selectedCategory);
  if (state.selectedSource) parts.push(getSource(state.selectedSource)?.label || state.selectedSource);
  renderResults(items, parts.length ? `${parts.join(" · ")} ${setting("resultsSuffix", "的结果")}` : "全部资源");
}

function openModal(id) {
  const resource = resources.find((item) => String(item.id) === String(id));
  if (!resource) return;
  const availableSources = sources.filter((source) => resource.links?.[source.id]);
  if (!availableSources.length) return showToast(setting("noLinkToast", "该资源暂未配置链接"));

  state.currentResource = resource;
  state.currentProvider = availableSources[0].id;
  els.modalResourceName.textContent = resource.title;
  els.providerTabs.innerHTML = availableSources.map((source) => `
    <button type="button" data-provider="${escapeHtml(source.id)}">${escapeHtml(source.label)}</button>
  `).join("");
  updateProvider();
  els.modal.hidden = false;
  document.body.classList.add("modal-open");
  document.querySelector("#closeModalIcon").focus();
}

function updateProvider() {
  const source = getSource(state.currentProvider);
  const link = getResourceLink(state.currentResource, state.currentProvider);
  els.activeProvider.textContent = source?.label || setting("sourceFallbackLabel", "网盘");
  els.linkValue.textContent = link;
  els.copyLink.disabled = !link;
  els.openLink.disabled = !link;
  els.providerTabs.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.provider === state.currentProvider);
  });
}

function closeModal() {
  els.modal.hidden = true;
  document.body.classList.remove("modal-open");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 1800);
}

async function copyCurrentLink() {
  const value = getResourceLink(state.currentResource, state.currentProvider);
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  showToast(setting("copiedToast", "链接已复制"));
}

document.addEventListener("click", (event) => {
  const resourceTarget = event.target.closest("[data-resource-id]");
  if (resourceTarget) openModal(resourceTarget.dataset.resourceId);

  const categoryTarget = event.target.closest("[data-category]");
  if (categoryTarget) {
    const category = categoryTarget.dataset.category;
    state.selectedCategory = state.selectedCategory === category ? null : category;
    document.querySelectorAll(".category-tabs button").forEach((button) => {
      button.classList.toggle("active", button.dataset.category === state.selectedCategory);
    });
    applySearch();
  }

  const sourceTarget = event.target.closest("[data-source]");
  if (sourceTarget) {
    const source = sourceTarget.dataset.source;
    state.selectedSource = state.selectedSource === source ? null : source;
    document.querySelectorAll(".source-chips button").forEach((button) => {
      button.classList.toggle("active", button.dataset.source === state.selectedSource);
    });
    applySearch();
  }

  const providerTarget = event.target.closest("[data-provider]");
  if (providerTarget) {
    state.currentProvider = providerTarget.dataset.provider;
    updateProvider();
  }

  const showAllTarget = event.target.closest("[data-show-all]");
  if (showAllTarget) {
    const type = showAllTarget.dataset.showAll;
    const items = type === "rating" ? [...resources].sort((a, b) => Number(b.rating) - Number(a.rating)) : [...resources].sort((a, b) => Number(b.heat) - Number(a.heat));
    const suffix = setting("allSuffix", "· 全部");
    const title = type === "rating" ? `${setting("ratingTitle", "好评榜")} ${suffix}` : type === "popular" ? `${setting("popularTitle", "人气榜")} ${suffix}` : `${setting("hotTitle", "热门资源")} ${suffix}`;
    renderResults(items, title);
  }
});

els.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  applySearch();
});

els.clearFilter.addEventListener("click", clearFilters);
document.querySelector("#closeModalIcon").addEventListener("click", closeModal);
els.closeModal.addEventListener("click", closeModal);
els.copyLink.addEventListener("click", copyCurrentLink);
els.openLink.addEventListener("click", () => {
  const link = getResourceLink(state.currentResource, state.currentProvider);
  if (link) window.open(link, "_blank", "noopener,noreferrer");
});
els.modal.addEventListener("click", (event) => {
  if (event.target === els.modal) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !els.modal.hidden) closeModal();
});
document.addEventListener("error", (event) => {
  if (event.target.matches?.(".poster-img")) event.target.hidden = true;
}, true);

async function bootstrap() {
  try {
    const response = await fetch(`/api/config?refresh=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("配置读取失败");
    config = await response.json();
    resources = (config.resources || [])
      .filter((resource) => resource.visible !== false)
      .map((resource) => ({ ...resource, category: normalizeCategory(resource.category) || "其他" }));
    sources = config.sources || [];
    const discovered = resources.map((resource) => resource.category);
    categories = [...new Set([...(config.categoryOrder || []), ...discovered]
      .map(normalizeCategory)
      .filter(Boolean))];
    applyThemeAndText();
    renderSourceChips();
    renderCategories();
    renderHome();
  } catch (error) {
    document.querySelector(".app-shell").innerHTML = `
      <section class="content-card fatal-card">
        <h1>${escapeHtml(setting("offlineTitle", "网站服务尚未启动"))}</h1>
        <p>${escapeHtml(setting("offlineDescription", "请先运行后台服务，再刷新此页面。"))}</p>
      </section>`;
    console.error(error);
  }
}

bootstrap();
