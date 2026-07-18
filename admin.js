const state = {
  config: null,
  session: null,
  accounts: [],
  dirty: false,
  saving: false,
  filter: "",
  toastTimer: null
};

const els = {
  loginView: document.querySelector("#loginView"),
  adminView: document.querySelector("#adminView"),
  loginForm: document.querySelector("#loginForm"),
  loginUsername: document.querySelector("#loginUsername"),
  loginPassword: document.querySelector("#loginPassword"),
  loginError: document.querySelector("#loginError"),
  logoutButton: document.querySelector("#logoutButton"),
  saveButton: document.querySelector("#saveButton"),
  saveStatus: document.querySelector("#saveStatus"),
  pageHeading: document.querySelector("#pageHeading"),
  resourceCount: document.querySelector("#resourceCount"),
  settingsEditor: document.querySelector("#settingsEditor"),
  themeEditor: document.querySelector("#themeEditor"),
  categoryEditor: document.querySelector("#categoryEditor"),
  sourcesEditor: document.querySelector("#sourcesEditor"),
  addSourceButton: document.querySelector("#addSourceButton"),
  resourceSearch: document.querySelector("#resourceSearch"),
  filteredCount: document.querySelector("#filteredCount"),
  resourcesEditor: document.querySelector("#resourcesEditor"),
  addResourceButton: document.querySelector("#addResourceButton"),
  currentAdminName: document.querySelector("#currentAdminName"),
  currentAdminRole: document.querySelector("#currentAdminRole"),
  addAdminForm: document.querySelector("#addAdminForm"),
  newAdminUsername: document.querySelector("#newAdminUsername"),
  newAdminDisplayName: document.querySelector("#newAdminDisplayName"),
  newAdminPassword: document.querySelector("#newAdminPassword"),
  newAdminEnabled: document.querySelector("#newAdminEnabled"),
  adminAccountCount: document.querySelector("#adminAccountCount"),
  adminAccountsList: document.querySelector("#adminAccountsList"),
  adminToast: document.querySelector("#adminToast")
};

const textGroups = [
  {
    title: "品牌与搜索区",
    description: "控制浏览器标题、顶部品牌和搜索卡片。",
    fields: [
      ["pageTitle", "浏览器页面标题"], ["logoText", "LOGO文字"], ["brandTitle", "顶部品牌名称"],
      ["heroTitle", "搜索区主标题"], ["heroSubtitle", "搜索区说明", "textarea", true],
      ["searchAriaLabel", "搜索框辅助名称"], ["searchPlaceholder", "搜索框提示语", "textarea", true], ["searchButton", "搜索按钮文字"]
    ]
  },
  {
    title: "搜索结果与榜单",
    description: "修改搜索状态、空结果提示及三个板块名称。",
    fields: [
      ["resultDefaultTitle", "结果区默认标题"], ["backToHot", "返回按钮文字"],
      ["resultsSuffix", "搜索结果后缀"], ["allSuffix", "查看全部后缀"],
      ["emptyTitle", "无结果标题"], ["emptyDescription", "无结果说明", "textarea", true],
      ["hotTitle", "热门资源标题"], ["popularTitle", "人气榜标题"], ["ratingTitle", "好评榜标题"],
      ["viewMore", "查看更多按钮"], ["posterKicker", "海报竖排小字"], ["rankPrefix", "排名前缀"]
    ]
  },
  {
    title: "资源弹窗与页脚",
    description: "修改用户点击资源后看到的提示以及页面底部文案。",
    fields: [
      ["modalTitle", "弹窗标题"], ["modalSuccess", "获取成功标题"], ["modalLinkStatus", "链接状态说明"],
      ["modalTip", "弹窗提示语", "textarea", true], ["copyButton", "复制按钮"], ["openButton", "打开按钮"],
      ["closeButton", "关闭按钮"], ["copiedToast", "复制成功提示"], ["noLinkToast", "无链接提示"],
      ["sourceFallbackLabel", "网盘备用名称"], ["footerText", "页脚说明", "textarea", true],
      ["offlineTitle", "服务未启动标题"], ["offlineDescription", "服务未启动说明", "textarea", true]
    ]
  }
];

const themeFields = [
  ["accent", "主强调色"],
  ["accentSecondary", "渐变辅助色"],
  ["pageBackground", "页面背景色"]
];

const permissionMeta = {
  content: ["全站文案", "修改标题、提示语和弹窗文案"],
  appearance: ["视觉与分类", "修改主题、分类和网盘来源"],
  resources: ["资源与链接", "新增、编辑和删除资源链接"],
  uploads: ["上传图片", "上传新的资源海报图片"],
  admins: ["管理员管理", "添加账号并分配权限"]
};

function can(permission) {
  return Boolean(state.session?.isRoot || state.session?.permissions?.includes(permission));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "请求失败");
  return payload;
}

function showToast(message, type = "success") {
  els.adminToast.textContent = message;
  els.adminToast.className = `admin-toast show${type === "error" ? " error" : ""}`;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { els.adminToast.className = "admin-toast"; }, 2200);
}

function markDirty() {
  state.dirty = true;
  els.saveStatus.textContent = "有未保存修改";
  els.saveStatus.classList.add("dirty");
}

function markSaved() {
  state.dirty = false;
  els.saveStatus.textContent = "已同步";
  els.saveStatus.classList.remove("dirty");
}

function showLogin() {
  els.loginView.hidden = false;
  els.adminView.hidden = true;
  setTimeout(() => els.loginPassword.focus(), 0);
}

function activatePanel(button) {
  if (!button || button.hidden) return;
  document.querySelectorAll("[data-panel-target]").forEach((item) => item.classList.toggle("active", item === button));
  document.querySelectorAll(".admin-panel").forEach((panel) => {
    const active = panel.id === button.dataset.panelTarget;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
  els.pageHeading.textContent = button.textContent.trim();
  const permission = button.dataset.permission;
  els.saveButton.hidden = !["content", "appearance", "resources"].includes(permission) || !can(permission);
  els.saveStatus.hidden = els.saveButton.hidden;
}

function applyPermissions() {
  els.currentAdminName.textContent = state.session?.displayName || state.session?.username || "管理员";
  els.currentAdminRole.textContent = state.session?.isRoot ? "主管理员 · 全部权限" : `${state.session?.permissions?.length || 0} 项权限`;
  const buttons = [...document.querySelectorAll("[data-panel-target]")];
  buttons.forEach((button) => {
    button.hidden = !can(button.dataset.permission);
  });
  document.querySelectorAll("[data-required-permission]").forEach((panel) => {
    if (!can(panel.dataset.requiredPermission)) {
      panel.hidden = true;
      panel.classList.remove("active");
    }
  });
  const active = buttons.find((button) => !button.hidden && button.classList.contains("active")) || buttons.find((button) => !button.hidden);
  activatePanel(active);
}

async function loadAccounts() {
  if (!can("admins")) return;
  const result = await api("/api/admin/accounts");
  state.accounts = result.accounts || [];
  renderAccounts();
}

async function showAdmin() {
  const status = await api("/api/auth/status");
  if (!status.authenticated || !status.user) return showLogin();
  state.session = status.user;
  state.config = await api("/api/admin/config");
  els.loginView.hidden = true;
  els.adminView.hidden = false;
  renderAll();
  applyPermissions();
  await loadAccounts();
  markSaved();
}

function fieldMarkup(field) {
  const [key, label, type = "text", wide = false] = field;
  const value = state.config.settings?.[key] || "";
  return `<label class="field${wide ? " wide" : ""}"><span>${escapeHtml(label)}</span>${
    type === "textarea"
      ? `<textarea data-setting="${escapeHtml(key)}">${escapeHtml(value)}</textarea>`
      : `<input data-setting="${escapeHtml(key)}" value="${escapeHtml(value)}" />`
  }</label>`;
}

function renderSettings() {
  els.settingsEditor.innerHTML = textGroups.map((group) => `
    <div class="editor-section">
      <div class="section-title"><div><h3>${escapeHtml(group.title)}</h3><p>${escapeHtml(group.description)}</p></div></div>
      <div class="form-grid">${group.fields.map(fieldMarkup).join("")}</div>
    </div>
  `).join("");
}

function renderTheme() {
  els.themeEditor.innerHTML = themeFields.map(([key, label]) => {
    const value = state.config.theme?.[key] || "#000000";
    return `<label class="theme-field"><input type="color" value="${escapeHtml(value)}" data-theme="${key}" /><div><span>${escapeHtml(label)}</span><input type="text" value="${escapeHtml(value)}" data-theme-text="${key}" /></div></label>`;
  }).join("");
}

function renderSources() {
  els.sourcesEditor.innerHTML = (state.config.sources || []).map((source, index) => `
    <div class="source-editor" data-source-index="${index}">
      <label class="field"><span>显示名称</span><input data-source-field="label" value="${escapeHtml(source.label)}" /></label>
      <label class="field"><span>默认打开地址</span><input data-source-field="defaultLink" value="${escapeHtml(source.defaultLink)}" placeholder="https://" /></label>
      <button class="mini-delete" type="button" data-action="delete-source" title="删除来源">×</button>
    </div>
  `).join("");
}

function resourceMatches(resource) {
  const query = state.filter.trim().toLowerCase();
  return !query || [resource.title, resource.artTitle, resource.category, resource.update].join(" ").toLowerCase().includes(query);
}

function resourceMarkup(resource, index) {
  const sourceRows = (state.config.sources || []).map((source) => `
    <label class="provider-row"><span>${escapeHtml(source.label)}</span><input data-resource-link="${escapeHtml(source.id)}" value="${escapeHtml(resource.links?.[source.id] || "")}" placeholder="留空则不显示该网盘" /></label>
  `).join("");
  const image = resource.image ? `<img src="${escapeHtml(resource.image)}" alt="海报预览" />` : "";
  const colors = Array.isArray(resource.colors) ? resource.colors : ["#26354f", "#7786a5"];
  return `
    <details class="resource-editor" data-resource-index="${index}">
      <summary>
        <img class="summary-poster" src="${escapeHtml(resource.image || "")}" alt="" />
        <div class="summary-copy"><strong>${escapeHtml(resource.title)}</strong><span>${escapeHtml(resource.category)} · ${escapeHtml(resource.update || "未填写更新信息")}</span></div>
        <div class="summary-meta"><span>🔥 ${Number(resource.heat) || 0}</span><span>⭐ ${Number(resource.rating) || 0}</span></div>
      </summary>
      <div class="resource-body">
        <div class="resource-layout">
          <div class="poster-control">
            <div class="poster-preview" style="background:linear-gradient(145deg,${escapeHtml(colors[0])},${escapeHtml(colors[1])})">${image}</div>
            ${can("uploads") ? `<label class="upload-button">上传新海报<input type="file" accept="image/png,image/jpeg,image/webp" data-upload-poster /></label>` : `<p class="upload-permission-note">当前账号无图片上传权限</p>`}
            <label class="field"><span>图片地址</span><input data-resource-field="image" value="${escapeHtml(resource.image)}" /></label>
          </div>
          <div class="resource-fields">
            <div class="form-grid">
              <label class="field wide"><span>列表完整标题</span><input data-resource-field="title" value="${escapeHtml(resource.title)}" /></label>
              <label class="field"><span>海报上的短标题</span><input data-resource-field="artTitle" value="${escapeHtml(resource.artTitle)}" /></label>
              <label class="field"><span>分类</span><input data-resource-field="category" value="${escapeHtml(resource.category)}" list="categorySuggestions" /></label>
              <label class="field"><span>更新说明</span><input data-resource-field="update" value="${escapeHtml(resource.update)}" /></label>
              <label class="field"><span>热度</span><input type="number" min="0" data-resource-field="heat" value="${Number(resource.heat) || 0}" /></label>
              <label class="field"><span>评分（0-10）</span><input type="number" min="0" max="10" step="0.1" data-resource-field="rating" value="${Number(resource.rating) || 0}" /></label>
              <label class="field"><span>备用色一</span><input type="color" data-resource-color="0" value="${escapeHtml(colors[0])}" /></label>
              <label class="field"><span>备用色二</span><input type="color" data-resource-color="1" value="${escapeHtml(colors[1])}" /></label>
              <label class="field"><span>前台显示</span><span class="visibility-field"><input type="checkbox" data-resource-visible ${resource.visible !== false ? "checked" : ""} /><span>启用这个资源</span></span></label>
              <div class="provider-links"><strong>网盘链接</strong>${sourceRows || "<small>请先在“视觉与分类”中添加网盘来源。</small>"}</div>
            </div>
            <div class="resource-actions">
              <button type="button" data-action="move-up">上移</button>
              <button type="button" data-action="move-down">下移</button>
              <button type="button" data-action="duplicate-resource">复制一份</button>
              <button class="danger" type="button" data-action="delete-resource">删除资源</button>
            </div>
          </div>
        </div>
      </div>
    </details>`;
}

function renderResources() {
  const all = state.config.resources || [];
  const entries = all.map((resource, index) => ({ resource, index })).filter(({ resource }) => resourceMatches(resource));
  els.resourcesEditor.innerHTML = entries.length ? entries.map(({ resource, index }) => resourceMarkup(resource, index)).join("") : `<div class="empty-resources">没有找到匹配的资源</div>`;
  els.resourceCount.textContent = all.length;
  els.filteredCount.textContent = `共 ${entries.length} 条`;
}

function permissionOptions(account, disabled = false) {
  return Object.entries(permissionMeta).map(([key, [label, description]]) => `
    <label>
      <input type="checkbox" value="${key}" data-account-permission ${account.permissions?.includes(key) ? "checked" : ""} ${disabled ? "disabled" : ""} />
      <span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(description)}</small></span>
    </label>
  `).join("");
}

function accountMarkup(account) {
  const avatar = (account.displayName || account.username || "管").slice(0, 1).toUpperCase();
  const stateLabel = account.enabled ? "已启用" : "已停用";
  if (account.isRoot) {
    return `
      <article class="admin-account-card root-account" data-account-id="root">
        <div class="account-card-head">
          <div class="account-identity"><span class="account-avatar">${escapeHtml(avatar)}</span><div><strong>${escapeHtml(account.displayName)}</strong><span>@${escapeHtml(account.username)} · 主管理员</span></div></div>
          <span class="account-state">${stateLabel}</span>
        </div>
        <div class="account-card-body">
          <div class="root-account-note">主管理员由部署环境保护，始终拥有全部权限，不能在网页后台停用或删除。</div>
          <div class="account-permissions"><div class="permission-grid">${permissionOptions(account, true)}</div></div>
        </div>
      </article>`;
  }
  return `
    <article class="admin-account-card" data-account-id="${escapeHtml(account.id)}">
      <div class="account-card-head">
        <div class="account-identity"><span class="account-avatar">${escapeHtml(avatar)}</span><div><strong>${escapeHtml(account.displayName)}</strong><span>@${escapeHtml(account.username)}</span></div></div>
        <span class="account-state${account.enabled ? "" : " disabled"}">${stateLabel}</span>
      </div>
      <div class="account-card-body">
        <div class="account-edit-grid">
          <label class="field"><span>登录账号</span><input data-account-field="username" value="${escapeHtml(account.username)}" /></label>
          <label class="field"><span>显示名称</span><input data-account-field="displayName" value="${escapeHtml(account.displayName)}" /></label>
          <label class="field"><span>重置密码</span><input data-account-field="password" type="password" autocomplete="new-password" placeholder="不修改请留空" /></label>
        </div>
        <fieldset class="permission-fieldset account-permissions"><legend>功能权限</legend><div class="permission-grid">${permissionOptions(account)}</div></fieldset>
        <label class="account-enabled"><input type="checkbox" data-account-enabled ${account.enabled ? "checked" : ""} /><span>启用这个管理员账号</span></label>
        <div class="account-card-actions">
          <button class="save-account" type="button" data-account-action="save">保存账号与权限</button>
          <button class="delete-account" type="button" data-account-action="delete">删除管理员</button>
        </div>
      </div>
    </article>`;
}

function renderAccounts() {
  if (!els.adminAccountsList) return;
  els.adminAccountCount.textContent = `共 ${state.accounts.length} 个账号`;
  els.adminAccountsList.innerHTML = state.accounts.map(accountMarkup).join("");
}

function renderAll() {
  renderSettings();
  renderTheme();
  els.categoryEditor.value = (state.config.categoryOrder || []).join("\n");
  renderSources();
  renderResources();
  let list = document.querySelector("#categorySuggestions");
  if (!list) {
    list = document.createElement("datalist");
    list.id = "categorySuggestions";
    document.body.appendChild(list);
  }
  list.innerHTML = (state.config.categoryOrder || []).map((item) => `<option value="${escapeHtml(item)}"></option>`).join("");
}

function updateResourceSummary(container, resource) {
  const title = container.querySelector(".summary-copy strong");
  const meta = container.querySelector(".summary-copy span");
  let preview = container.querySelector(".poster-preview img");
  const previewBox = container.querySelector(".poster-preview");
  const summaryImage = container.querySelector(".summary-poster");
  if (title) title.textContent = resource.title;
  if (meta) meta.textContent = `${resource.category} · ${resource.update || "未填写更新信息"}`;
  if (!preview && resource.image && previewBox) {
    preview = document.createElement("img");
    preview.alt = "海报预览";
    previewBox.appendChild(preview);
  }
  if (preview) preview.src = resource.image;
  if (summaryImage) summaryImage.src = resource.image;
}

async function uploadPoster(input) {
  const container = input.closest("[data-resource-index]");
  const index = Number(container.dataset.resourceIndex);
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return showToast("图片不能超过5MB", "error");
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  input.disabled = true;
  try {
    const result = await api("/api/admin/upload", { method: "POST", body: JSON.stringify({ filename: file.name, dataUrl }) });
    state.config.resources[index].image = result.url;
    const imageInput = container.querySelector('[data-resource-field="image"]');
    if (imageInput) imageInput.value = result.url;
    updateResourceSummary(container, state.config.resources[index]);
    markDirty();
    showToast("海报上传成功，记得保存发布");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    input.disabled = false;
    input.value = "";
  }
}

function addSource() {
  const next = (state.config.sources?.length || 0) + 1;
  state.config.sources.push({ id: `source-${Date.now()}`, label: `新网盘${next}`, defaultLink: "" });
  renderSources();
  renderResources();
  markDirty();
}

function addResource() {
  const maxId = Math.max(0, ...(state.config.resources || []).map((item) => Number(item.id) || 0));
  const firstSource = state.config.sources?.[0];
  const resource = {
    id: maxId + 1,
    title: "新资源",
    artTitle: "新资源",
    category: state.config.categoryOrder?.[0] || "其他",
    update: "持续更新",
    heat: 0,
    rating: 8,
    image: "",
    colors: ["#26354f", "#7786a5"],
    links: firstSource ? { [firstSource.id]: firstSource.defaultLink || "" } : {},
    visible: true
  };
  state.config.resources.unshift(resource);
  state.filter = "";
  els.resourceSearch.value = "";
  renderResources();
  const first = els.resourcesEditor.querySelector("details");
  if (first) first.open = true;
  markDirty();
}

function selectedPermissions(container, selector) {
  return [...container.querySelectorAll(`${selector}:checked`)].map((input) => input.value);
}

async function addAdminAccount(event) {
  event.preventDefault();
  const submit = els.addAdminForm.querySelector("button[type=submit]");
  submit.disabled = true;
  submit.textContent = "正在添加...";
  try {
    const result = await api("/api/admin/accounts", {
      method: "POST",
      body: JSON.stringify({
        username: els.newAdminUsername.value,
        displayName: els.newAdminDisplayName.value,
        password: els.newAdminPassword.value,
        enabled: els.newAdminEnabled.checked,
        permissions: selectedPermissions(els.addAdminForm, "[data-new-permission]")
      })
    });
    state.accounts = result.accounts || [];
    renderAccounts();
    els.addAdminForm.reset();
    els.newAdminEnabled.checked = true;
    els.addAdminForm.querySelector('[data-new-permission][value="content"]').checked = true;
    els.addAdminForm.querySelector('[data-new-permission][value="resources"]').checked = true;
    showToast(result.message || "管理员账号已添加");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    submit.disabled = false;
    submit.textContent = "+ 添加管理员账号";
  }
}

async function saveAdminAccount(card) {
  const id = card.dataset.accountId;
  const button = card.querySelector('[data-account-action="save"]');
  button.disabled = true;
  button.textContent = "正在保存...";
  try {
    const result = await api(`/api/admin/accounts/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        username: card.querySelector('[data-account-field="username"]').value,
        displayName: card.querySelector('[data-account-field="displayName"]').value,
        password: card.querySelector('[data-account-field="password"]').value,
        enabled: card.querySelector("[data-account-enabled]").checked,
        permissions: selectedPermissions(card, "[data-account-permission]")
      })
    });
    state.accounts = result.accounts || [];
    renderAccounts();
    showToast(result.message || "管理员账号已更新");
    if (state.session?.id === id) {
      state.config = null;
      state.session = null;
      showLogin();
    }
  } catch (error) {
    button.disabled = false;
    button.textContent = "保存账号与权限";
    showToast(error.message, "error");
  }
}

async function deleteAdminAccount(card) {
  const id = card.dataset.accountId;
  const account = state.accounts.find((item) => item.id === id);
  if (!account || !confirm(`确定删除管理员“${account.displayName || account.username}”吗？`)) return;
  const button = card.querySelector('[data-account-action="delete"]');
  button.disabled = true;
  try {
    const result = await api(`/api/admin/accounts/${id}`, { method: "DELETE" });
    state.accounts = result.accounts || [];
    renderAccounts();
    showToast(result.message || "管理员账号已删除");
    if (state.session?.id === id) {
      state.config = null;
      state.session = null;
      showLogin();
    }
  } catch (error) {
    button.disabled = false;
    showToast(error.message, "error");
  }
}

async function saveConfig() {
  if (state.saving) return;
  state.saving = true;
  els.saveButton.disabled = true;
  els.saveButton.textContent = "正在保存...";
  try {
    const result = await api("/api/admin/config", { method: "PUT", body: JSON.stringify(state.config) });
    state.config = result.config;
    renderAll();
    markSaved();
    showToast(result.message || "保存成功");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    state.saving = false;
    els.saveButton.disabled = false;
    els.saveButton.textContent = "保存并发布";
  }
}

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.loginError.textContent = "";
  const submit = els.loginForm.querySelector("button[type=submit]");
  submit.disabled = true;
  submit.textContent = "登录中...";
  try {
    await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: els.loginUsername.value, password: els.loginPassword.value }) });
    els.loginPassword.value = "";
    await showAdmin();
  } catch (error) {
    els.loginError.textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = "登录后台";
  }
});

els.logoutButton.addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST", body: "{}" }).catch(() => {});
  state.config = null;
  state.session = null;
  state.accounts = [];
  showLogin();
});

document.querySelectorAll("[data-panel-target]").forEach((button) => {
  button.addEventListener("click", () => activatePanel(button));
});

document.addEventListener("input", (event) => {
  if (!state.config) return;
  const target = event.target;
  if (target.dataset.setting) {
    state.config.settings[target.dataset.setting] = target.value;
    markDirty();
  }
  if (target.dataset.theme || target.dataset.themeText) {
    const key = target.dataset.theme || target.dataset.themeText;
    if (/^#[0-9a-f]{6}$/i.test(target.value)) {
      state.config.theme[key] = target.value;
      document.querySelector(`[data-theme="${key}"]`).value = target.value;
      document.querySelector(`[data-theme-text="${key}"]`).value = target.value;
      markDirty();
    }
  }
  if (target === els.categoryEditor) {
    state.config.categoryOrder = target.value.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean);
    markDirty();
  }
  if (target === els.resourceSearch) {
    state.filter = target.value;
    renderResources();
  }

  const sourceContainer = target.closest?.("[data-source-index]");
  if (sourceContainer && target.dataset.sourceField) {
    const index = Number(sourceContainer.dataset.sourceIndex);
    state.config.sources[index][target.dataset.sourceField] = target.value;
    markDirty();
  }

  const resourceContainer = target.closest?.("[data-resource-index]");
  if (resourceContainer) {
    const index = Number(resourceContainer.dataset.resourceIndex);
    const resource = state.config.resources[index];
    if (target.dataset.resourceField) {
      const field = target.dataset.resourceField;
      resource[field] = ["heat", "rating"].includes(field) ? Number(target.value) : target.value;
      updateResourceSummary(resourceContainer, resource);
      markDirty();
    }
    if (target.dataset.resourceLink) {
      resource.links[target.dataset.resourceLink] = target.value;
      markDirty();
    }
    if (target.dataset.resourceColor) {
      resource.colors[Number(target.dataset.resourceColor)] = target.value;
      resourceContainer.querySelector(".poster-preview").style.background = `linear-gradient(145deg,${resource.colors[0]},${resource.colors[1]})`;
      markDirty();
    }
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target.matches('[data-new-permission][value="uploads"]') && target.checked) {
    els.addAdminForm.querySelector('[data-new-permission][value="resources"]').checked = true;
  }
  if (target.matches('[data-account-permission][value="uploads"]') && target.checked) {
    const resourcePermission = target.closest("[data-account-id]")?.querySelector('[data-account-permission][value="resources"]');
    if (resourcePermission) resourcePermission.checked = true;
  }
  if (target.matches("[data-upload-poster]")) uploadPoster(target);
  if (target.matches("[data-resource-visible]")) {
    const container = target.closest("[data-resource-index]");
    state.config.resources[Number(container.dataset.resourceIndex)].visible = target.checked;
    markDirty();
  }
});

document.addEventListener("click", (event) => {
  const accountAction = event.target.closest("[data-account-action]")?.dataset.accountAction;
  const accountCard = event.target.closest("[data-account-id]");
  if (accountAction && accountCard) {
    if (accountAction === "save") saveAdminAccount(accountCard);
    if (accountAction === "delete") deleteAdminAccount(accountCard);
    return;
  }

  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action || !state.config) return;

  const sourceContainer = event.target.closest("[data-source-index]");
  if (action === "delete-source" && sourceContainer) {
    const index = Number(sourceContainer.dataset.sourceIndex);
    const source = state.config.sources[index];
    if (!confirm(`确定删除“${source.label}”吗？相关资源中的这个网盘链接也会删除。`)) return;
    state.config.sources.splice(index, 1);
    state.config.resources.forEach((resource) => delete resource.links?.[source.id]);
    renderSources();
    renderResources();
    markDirty();
    return;
  }

  const container = event.target.closest("[data-resource-index]");
  if (!container) return;
  const index = Number(container.dataset.resourceIndex);
  if (action === "delete-resource") {
    if (!confirm(`确定删除“${state.config.resources[index].title}”吗？`)) return;
    state.config.resources.splice(index, 1);
  }
  if (action === "duplicate-resource") {
    const duplicate = structuredClone(state.config.resources[index]);
    duplicate.id = Math.max(0, ...state.config.resources.map((item) => Number(item.id) || 0)) + 1;
    duplicate.title += "（副本）";
    state.config.resources.splice(index + 1, 0, duplicate);
  }
  if (action === "move-up" && index > 0) {
    [state.config.resources[index - 1], state.config.resources[index]] = [state.config.resources[index], state.config.resources[index - 1]];
  }
  if (action === "move-down" && index < state.config.resources.length - 1) {
    [state.config.resources[index + 1], state.config.resources[index]] = [state.config.resources[index], state.config.resources[index + 1]];
  }
  renderResources();
  markDirty();
});

els.addSourceButton.addEventListener("click", addSource);
els.addResourceButton.addEventListener("click", addResource);
els.saveButton.addEventListener("click", saveConfig);
els.addAdminForm.addEventListener("submit", addAdminAccount);

window.addEventListener("beforeunload", (event) => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

api("/api/auth/status")
  .then((status) => status.authenticated ? showAdmin() : showLogin())
  .catch(showLogin);
