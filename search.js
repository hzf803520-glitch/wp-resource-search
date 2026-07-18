let config = null;
let resources = [];
let sources = [];
let categories = [];

const params = new URLSearchParams(window.location.search);
const state = {
  query: params.get("q") || "",
  category: params.get("category") || "",
  source: params.get("source") || "",
  sort: ["default", "hot", "rating", "year"].includes(params.get("sort")) ? params.get("sort") : "default",
  view: params.get("view") === "grid" ? "grid" : "list",
  currentResource: null,
  currentProvider: null,
  toastTimer: null
};

const els = Object.fromEntries([
  "backButton", "searchPageForm", "searchPageInput", "searchPageSubmit", "sortFilters", "categoryFilters",
  "sourceFilters", "resultSummary", "resultCount", "searchResults", "searchEmpty", "searchEmptyTitle",
  "searchEmptyDescription", "resetFilters", "resourceModal", "closeModalIcon", "modal-title", "modalSuccess",
  "modalResourceName", "providerTabs", "activeProvider", "modalLinkStatus", "linkValue", "modalTip", "copyLink",
  "openLink", "closeModal", "toast", "themeColorMeta"
].map((id) => [id.replace("-", ""), document.getElementById(id)]));

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

function getSource(id) {
  return sources.find((source) => source.id === id);
}

function getResourceLink(resource, sourceId) {
  return resource?.links?.[sourceId] || getSource(sourceId)?.defaultLink || "";
}

function resourceYear(resource) {
  const match = [resource.title, resource.update].join(" ").match(/(?:19|20)\d{2}/);
  return match ? Number(match[0]) : 0;
}

function syncUrl() {
  const next = new URL(window.location.href);
  next.search = "";
  if (state.query) next.searchParams.set("q", state.query);
  if (state.category) next.searchParams.set("category", state.category);
  if (state.source) next.searchParams.set("source", state.source);
  if (state.sort !== "default") next.searchParams.set("sort", state.sort);
  if (state.view !== "list") next.searchParams.set("view", state.view);
  history.replaceState(null, "", next);
}

function applyThemeAndText() {
  const root = document.documentElement;
  root.style.setProperty("--accent", config.theme?.accent || "#ff725f");
  root.style.setProperty("--accent-2", config.theme?.accentSecondary || "#ff8a59");
  els.themeColorMeta.content = "#f4f4f5";
  document.title = `搜索资源 - ${setting("brandTitle", "网盘资源搜索")}`;
  els.searchPageInput.placeholder = setting("searchPlaceholder", "搜索资源...");
  els.searchPageSubmit.textContent = setting("searchButton", "搜索");
  els.searchEmptyTitle.textContent = setting("emptyTitle", "没有找到相关资源");
  els.searchEmptyDescription.textContent = setting("emptyDescription", "换个关键词或筛选条件再试试");
  els.modaltitle.textContent = setting("modalTitle", "资源链接");
  els.modalSuccess.textContent = setting("modalSuccess", "获取成功!");
  els.modalLinkStatus.textContent = setting("modalLinkStatus", "资源链接");
  els.modalTip.textContent = setting("modalTip", "请点击对应网盘按钮复制或打开链接");
  els.copyLink.textContent = setting("copyButton", "复制链接");
  els.openLink.textContent = setting("openButton", "打开链接");
  els.closeModal.textContent = setting("closeButton", "关闭");
}

function renderFilters() {
  els.categoryFilters.innerHTML = [
    `<button type="button" data-category="" class="${state.category ? "" : "active"}">全部分类</button>`,
    ...categories.map((category) => `<button type="button" data-category="${escapeHtml(category)}" class="${state.category === category ? "active" : ""}">${escapeHtml(category)}</button>`)
  ].join("");

  els.sourceFilters.innerHTML = [
    `<button type="button" data-source="" class="${state.source ? "" : "active"}">全部网盘</button>`,
    ...sources.map((source) => `<button type="button" data-source="${escapeHtml(source.id)}" class="${state.source === source.id ? "active" : ""}">${escapeHtml(source.label)}</button>`)
  ].join("");

  els.sortFilters.querySelectorAll("[data-sort]").forEach((button) => {
    button.classList.toggle("active", button.dataset.sort === state.sort);
  });
  els.sortFilters.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });
}

function matchingResources() {
  const query = state.query.trim().toLowerCase();
  const items = resources.filter((resource) => {
    const sourceLabels = Object.keys(resource.links || {}).map((id) => getSource(id)?.label || "");
    const haystack = [resource.title, resource.artTitle, resource.category, resource.update, ...sourceLabels].join(" ").toLowerCase();
    return (!query || haystack.includes(query))
      && (!state.category || resource.category === state.category)
      && (!state.source || Boolean(resource.links?.[state.source]));
  });
  if (state.sort === "hot") items.sort((a, b) => Number(b.heat) - Number(a.heat));
  if (state.sort === "rating") items.sort((a, b) => Number(b.rating) - Number(a.rating));
  if (state.sort === "year") items.sort((a, b) => resourceYear(b) - resourceYear(a));
  return items;
}

function sourceBadges(resource) {
  return Object.keys(resource.links || {}).map((id) => {
    const source = getSource(id);
    return source ? `<span class="result-badge">${escapeHtml(source.label)}</span>` : "";
  }).join("");
}

function listMarkup(resource, index) {
  return `<button class="result-row" type="button" data-resource-id="${escapeHtml(resource.id)}">
    <span class="result-rank">${index + 1}</span>
    <span class="result-copy">
      <span class="result-title">${escapeHtml(resource.title)}</span>
      <span class="result-meta"><span class="result-badge category">${escapeHtml(resource.category)}</span>${sourceBadges(resource)}<span>🔥 ${Number(resource.heat) || 0}</span></span>
    </span>
    <span class="result-arrow">›</span>
  </button>`;
}

function gridMarkup(resource, index) {
  const colors = Array.isArray(resource.colors) ? resource.colors : ["#26354f", "#7786a5"];
  const image = resource.image ? `<img src="${escapeHtml(resource.image)}" alt="${escapeHtml(resource.artTitle || resource.title)}" loading="lazy" />` : "";
  return `<button class="grid-result" type="button" data-resource-id="${escapeHtml(resource.id)}">
    <span class="grid-poster" style="--p1:${escapeHtml(colors[0])};--p2:${escapeHtml(colors[1])}">${image}<span class="result-rank">${index + 1}</span></span>
    <strong>${escapeHtml(resource.title)}</strong>
  </button>`;
}

function renderResults() {
  const items = matchingResources();
  const labels = [];
  if (state.query) labels.push(`“${state.query}”`);
  if (state.category) labels.push(state.category);
  if (state.source) labels.push(getSource(state.source)?.label || state.source);
  els.resultSummary.textContent = labels.length ? `${labels.join(" · ")} 的结果` : "全部资源";
  els.resultCount.textContent = `共 ${items.length} 条`;
  els.searchResults.classList.toggle("grid-view", state.view === "grid");
  els.searchResults.innerHTML = items.map(state.view === "grid" ? gridMarkup : listMarkup).join("");
  els.searchResults.hidden = items.length === 0;
  els.searchEmpty.hidden = items.length !== 0;
  renderFilters();
  syncUrl();
}

function openModal(id) {
  const resource = resources.find((item) => String(item.id) === String(id));
  if (!resource) return;
  const availableSources = sources.filter((source) => resource.links?.[source.id]);
  if (!availableSources.length) return showToast(setting("noLinkToast", "该资源暂未配置链接"));
  state.currentResource = resource;
  state.currentProvider = availableSources[0].id;
  els.modalResourceName.textContent = resource.title;
  els.providerTabs.innerHTML = availableSources.map((source) => `<button type="button" data-provider="${escapeHtml(source.id)}">${escapeHtml(source.label)}</button>`).join("");
  updateProvider();
  els.resourceModal.hidden = false;
  document.body.classList.add("modal-open");
  els.closeModalIcon.focus();
}

function updateProvider() {
  const source = getSource(state.currentProvider);
  const link = getResourceLink(state.currentResource, state.currentProvider);
  els.activeProvider.textContent = source?.label || setting("sourceFallbackLabel", "网盘");
  els.linkValue.textContent = link;
  els.copyLink.disabled = !link;
  els.openLink.disabled = !link;
  els.providerTabs.querySelectorAll("button").forEach((button) => button.classList.toggle("active", button.dataset.provider === state.currentProvider));
}

function closeModal() {
  els.resourceModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => els.toast.classList.remove("show"), 1800);
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
  const resource = event.target.closest("[data-resource-id]");
  if (resource) openModal(resource.dataset.resourceId);
  const category = event.target.closest("[data-category]");
  if (category) { state.category = category.dataset.category; renderResults(); }
  const source = event.target.closest("[data-source]");
  if (source) { state.source = source.dataset.source; renderResults(); }
  const sort = event.target.closest("[data-sort]");
  if (sort) { state.sort = sort.dataset.sort; renderResults(); }
  const view = event.target.closest("[data-view]");
  if (view) { state.view = view.dataset.view; renderResults(); }
  const provider = event.target.closest("[data-provider]");
  if (provider) { state.currentProvider = provider.dataset.provider; updateProvider(); }
});

els.searchPageForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.query = els.searchPageInput.value.trim();
  renderResults();
});
els.backButton.addEventListener("click", () => {
  if (history.length > 1 && document.referrer.startsWith(window.location.origin)) history.back();
  else window.location.href = "/";
});
els.resetFilters.addEventListener("click", () => {
  state.query = ""; state.category = ""; state.source = ""; state.sort = "default";
  els.searchPageInput.value = "";
  renderResults();
});
els.closeModalIcon.addEventListener("click", closeModal);
els.closeModal.addEventListener("click", closeModal);
els.copyLink.addEventListener("click", copyCurrentLink);
els.openLink.addEventListener("click", () => {
  const link = getResourceLink(state.currentResource, state.currentProvider);
  if (link) window.open(link, "_blank", "noopener,noreferrer");
});
els.resourceModal.addEventListener("click", (event) => { if (event.target === els.resourceModal) closeModal(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !els.resourceModal.hidden) closeModal(); });
document.addEventListener("error", (event) => { if (event.target.matches?.(".grid-poster img")) event.target.hidden = true; }, true);

async function bootstrap() {
  try {
    const response = await fetch(`/api/config?refresh=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("配置读取失败");
    config = await response.json();
    resources = (config.resources || []).filter((resource) => resource.visible !== false).map((resource) => ({ ...resource, category: String(resource.category || "其他").trim() }));
    sources = config.sources || [];
    categories = [...new Set((config.categoryOrder || []).map((category) => String(category || "").trim()).filter(Boolean))];
    if (state.category && !categories.includes(state.category)) state.category = "";
    if (state.source && !sources.some((source) => source.id === state.source)) state.source = "";
    els.searchPageInput.value = state.query;
    applyThemeAndText();
    renderResults();
  } catch (error) {
    document.querySelector(".search-shell").innerHTML = `<section class="search-results-card search-empty"><strong>页面暂时无法加载</strong><p>${escapeHtml(error.message)}</p></section>`;
  }
}

bootstrap();
