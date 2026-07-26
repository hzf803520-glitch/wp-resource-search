(() => {
  const root = document.querySelector("#smartImportApp");
  if (!root) return;

  const importer = {
    rows: [],
    fileName: "",
    running: false,
    publishing: false,
    message: "",
    messageType: "normal"
  };

  const aliases = {
    title: ["电视剧名称", "剧名", "电视剧名字", "资源名称", "标题"],
    baidu: ["新百度网盘链接", "百度网盘链接", "百度链接"],
    quark: ["新夸克网盘链接", "夸克网盘链接", "夸克链接"],
    platform: ["平台", "网盘", "网盘平台"],
    targetUrl: ["我的新链接", "新分享链接", "新链接", "转存链接"],
    category: ["分类", "资源分类"],
    update: ["更新说明", "说明", "集数说明"],
    rating: ["评分", "猫眼评分"],
    heat: ["热度", "想看人数"],
    image: ["封面", "封面图", "海报", "图片地址"]
  };

  function html(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    const source = String(text || "").replace(/^\uFEFF/, "");
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (char === '"' && source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else if (char === '"') quoted = false;
        else cell += char;
        continue;
      }
      if (char === '"') quoted = true;
      else if (char === ",") { row.push(cell); cell = ""; }
      else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
      else cell += char;
    }
    if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
    return rows.filter((item) => item.some((value) => String(value || "").trim()));
  }

  function columnIndex(headers, names) {
    const normalized = headers.map((item) => String(item || "").trim());
    for (const name of names) {
      const index = normalized.indexOf(name);
      if (index >= 0) return index;
    }
    return -1;
  }

  function valueAt(row, index) {
    return index >= 0 ? String(row[index] || "").trim() : "";
  }

  function splitDramaName(raw) {
    const clean = String(raw || "").replace(/[\u2000-\u200f\u2028\u2029\ufeff]/g, " ").trim();
    const dot = clean.match(/^(.+?)[.。·]\s*(.+)$/);
    if (dot) return { title: dot[1].trim(), update: dot[2].replace(/\s+/g, " ").trim() };
    const quality = clean.match(/^(.+?)\s+(?=(?:4K|1080P|720P|更\s*\d|全\s*\d|第\s*\d))/i);
    if (quality) return { title: quality[1].trim(), update: clean.slice(quality[0].length).trim() || "持续更新" };
    return { title: clean, update: "持续更新" };
  }

  function titleKey(value) {
    return String(value || "").replace(/[《》\s·.。—_\-:：()（）]/g, "").toLowerCase();
  }

  function platformType(value) {
    const label = String(value || "").toLowerCase();
    if (label.includes("夸克") || label.includes("quark")) return "quark";
    if (label.includes("百度") || label.includes("baidu")) return "baidu";
    return "";
  }

  function parseImportRows(matrix) {
    if (matrix.length < 2) throw new Error("CSV 没有可导入的数据");
    const headers = matrix[0].map((item) => String(item || "").trim());
    const indexes = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, columnIndex(headers, names)]));
    if (indexes.title < 0) throw new Error("CSV 缺少“电视剧名称/剧名”列");
    const grouped = new Map();

    for (const rawRow of matrix.slice(1)) {
      const rawTitle = valueAt(rawRow, indexes.title);
      if (!rawTitle) continue;
      const parsedName = splitDramaName(rawTitle);
      const key = titleKey(parsedName.title);
      if (!grouped.has(key)) {
        grouped.set(key, {
          key: `${Date.now()}-${grouped.size}`,
          title: parsedName.title,
          artTitle: parsedName.title,
          category: valueAt(rawRow, indexes.category) || defaultCategory(),
          update: valueAt(rawRow, indexes.update) || parsedName.update,
          rating: Number(valueAt(rawRow, indexes.rating)) || 0,
          heat: Number(valueAt(rawRow, indexes.heat)) || 0,
          image: valueAt(rawRow, indexes.image),
          baidu: "",
          quark: "",
          selected: true,
          status: "pending",
          note: "等待联网补全",
          existingId: existingResource(parsedName.title)?.id || null,
          year: 0
        });
      }
      const item = grouped.get(key);
      const wideBaidu = valueAt(rawRow, indexes.baidu);
      const wideQuark = valueAt(rawRow, indexes.quark);
      if (wideBaidu) item.baidu = wideBaidu;
      if (wideQuark) item.quark = wideQuark;
      if (indexes.platform >= 0 && indexes.targetUrl >= 0) {
        const type = platformType(valueAt(rawRow, indexes.platform));
        const link = valueAt(rawRow, indexes.targetUrl);
        if (type && link) item[type] = link;
      }
    }
    const rows = [...grouped.values()].filter((item) => item.baidu || item.quark || item.image || item.title);
    if (!rows.length) throw new Error("CSV 中没有可用资源");
    return rows;
  }

  function defaultCategory() {
    return state.config?.categoryOrder?.find((item) => /剧/.test(item)) || state.config?.categoryOrder?.[0] || "电视剧";
  }

  function existingResource(title) {
    const key = titleKey(title);
    return (state.config?.resources || []).find((item) => titleKey(item.title) === key) || null;
  }

  function sourceFor(type, create = false) {
    const info = type === "quark"
      ? { id: "quark", label: "夸克网盘", names: ["夸克", "quark"] }
      : { id: "baidu", label: "百度网盘", names: ["百度", "baidu"] };
    let source = (state.config?.sources || []).find((item) => {
      const label = String(item.label || "").toLowerCase();
      return item.id === info.id || info.names.some((name) => label.includes(name));
    });
    if (!source && create && can("appearance")) {
      source = { id: info.id, label: info.label, defaultLink: "" };
      state.config.sources.push(source);
    }
    return source || null;
  }

  function selectedRows() {
    return importer.rows.filter((row) => row.selected);
  }

  function readyCount() {
    return selectedRows().filter((row) => row.status === "ready").length;
  }

  function finishedCount() {
    return importer.rows.filter((row) => ["ready", "error"].includes(row.status)).length;
  }

  function progress() {
    return importer.rows.length ? Math.round((finishedCount() / importer.rows.length) * 100) : 0;
  }

  function setMessage(message, type = "normal") {
    importer.message = message;
    importer.messageType = type;
    render();
  }

  function rowMarkup(row, index) {
    const statusLabel = { pending: "待补全", searching: "搜索中", ready: "已就绪", error: "需检查" }[row.status];
    const categories = [...new Set([...(state.config?.categoryOrder || []), "电影", "电视剧", "短剧", "动漫", "综艺", "纪录片", "其他", row.category])].filter(Boolean);
    return `
      <article class="smart-import-row${row.selected ? "" : " is-muted"}" data-import-index="${index}">
        <div class="smart-import-check"><input type="checkbox" data-import-field="selected" ${row.selected ? "checked" : ""}></div>
        <div class="smart-import-poster">${row.image ? `<img src="${html(row.image)}" alt="">` : `<span>${html(row.artTitle.slice(0, 4) || "海报")}</span>`}</div>
        <div class="smart-import-body">
          <div class="smart-import-row-head">
            <div><strong>${html(row.title || "未命名资源")}</strong><small>${row.existingId ? "将覆盖同名资源" : "将新增资源"}</small></div>
            <span class="smart-import-status ${row.status}">${statusLabel}</span>
          </div>
          <div class="smart-import-grid">
            <label class="field wide"><span>列表完整标题</span><input data-import-field="title" value="${html(row.title)}"></label>
            <label class="field"><span>海报短标题</span><input data-import-field="artTitle" value="${html(row.artTitle)}"></label>
            <label class="field"><span>更新说明</span><input data-import-field="update" value="${html(row.update)}"></label>
            <label class="field"><span>分类</span><select data-import-field="category">${categories.map((item) => `<option${item === row.category ? " selected" : ""}>${html(item)}</option>`).join("")}</select></label>
            <label class="field"><span>评分</span><input type="number" min="0" max="10" step="0.1" data-import-field="rating" value="${Number(row.rating) || 0}"></label>
            <label class="field"><span>热度</span><input type="number" min="0" data-import-field="heat" value="${Number(row.heat) || 0}"></label>
            <label class="field wide"><span>封面图地址</span><input data-import-field="image" value="${html(row.image)}"></label>
          </div>
          <div class="smart-import-links">
            <div class="smart-import-link-title"><strong>网盘链接</strong><span>默认推荐：${row.quark ? "夸克网盘" : row.baidu ? "百度网盘" : "未配置"}</span></div>
            <div class="smart-import-grid two">
              <label class="field"><span>夸克网盘（优先）</span><input data-import-field="quark" value="${html(row.quark)}"></label>
              <label class="field"><span>百度网盘（备用）</span><input data-import-field="baidu" value="${html(row.baidu)}"></label>
            </div>
          </div>
          <div class="smart-import-row-foot"><span>${html(row.note || "等待联网补全")}</span><button type="button" data-import-action="enrich" ${row.status === "searching" ? "disabled" : ""}>${row.status === "ready" ? "重新补全" : "补全此条"}</button></div>
        </div>
      </article>`;
  }

  function render() {
    const selected = selectedRows().length;
    root.innerHTML = `
      <div class="smart-import-layout">
        <aside class="smart-import-side">
          <section class="smart-import-card">
            <div class="smart-import-step"><span>1</span><div><strong>上传 CSV 文件</strong><small>兼容资源对应表与网盘同步导出表</small></div></div>
            <label class="smart-import-drop">
              <input id="smartImportFile" type="file" accept=".csv,text/csv">
              <b>${html(importer.fileName || "选择 CSV 文件")}</b>
              <span>${importer.fileName ? "点击可重新选择" : "支持 UTF-8 编码"}</span>
            </label>
          </section>
          <section class="smart-import-card">
            <div class="smart-import-step"><span>2</span><div><strong>处理进度</strong><small>资料可逐条编辑后再发布</small></div></div>
            <div class="smart-import-progress"><span style="width:${progress()}%"></span></div>
            <div class="smart-import-stats"><div><b>${importer.rows.length}</b><span>已读取</span></div><div><b>${readyCount()}</b><span>已补全</span></div><div><b>${selected}</b><span>待发布</span></div></div>
          </section>
          <section class="smart-import-card smart-import-help">
            <strong>支持的主要表头</strong>
            <p>电视剧名称、新百度网盘链接、新夸克网盘链接；也兼容“剧名、平台、新分享链接”的逐行格式。</p>
          </section>
        </aside>
        <div class="smart-import-main">
          <div class="smart-import-toolbar">
            <div><h3>导入预览</h3><p>同名资源自动覆盖，未匹配资源自动新增；所有字段发布前均可修改。</p></div>
            <div class="smart-import-actions">
              <button type="button" class="outline-button" data-import-action="select-all">全选</button>
              <button type="button" class="outline-button" data-import-action="clear-all">清空选择</button>
              <button type="button" class="outline-button smart-import-enrich-all" data-import-action="enrich-all" ${importer.running || !selected ? "disabled" : ""}>${importer.running ? `正在补全 ${readyCount()}/${selected}…` : "✦ 一键补全全部"}</button>
              <button type="button" class="add-resource-button" data-import-action="publish" ${importer.publishing || !selected ? "disabled" : ""}>${importer.publishing ? "发布中…" : `发布 ${selected} 条`}</button>
            </div>
          </div>
          ${importer.message ? `<div class="smart-import-message ${importer.messageType}">${html(importer.message)}</div>` : ""}
          ${importer.rows.length ? `<div class="smart-import-list">${importer.rows.map(rowMarkup).join("")}</div>` : `<div class="smart-import-empty"><span>▤</span><strong>等待上传 CSV</strong><p>上传后会生成可编辑列表，再联网查找每部剧的评分、热度、分类和封面。</p></div>`}
        </div>
      </div>`;
  }

  async function chooseFile(file) {
    if (!state.config) return setMessage("请先登录后台", "error");
    importer.fileName = file.name;
    try {
      importer.rows = parseImportRows(parseCsv(await file.text()));
      importer.message = `已读取 ${importer.rows.length} 条资源，可先检查再批量补全。`;
      importer.messageType = "success";
    } catch (error) {
      importer.rows = [];
      importer.message = error.message || "CSV 读取失败";
      importer.messageType = "error";
    }
    render();
  }

  async function enrichOne(index, quiet = false) {
    const row = importer.rows[index];
    if (!row || !row.selected) return;
    row.status = "searching";
    row.note = "正在从猫眼查找完全匹配资料…";
    render();
    try {
      const result = await api("/api/admin/resource-enrich", {
        method: "POST",
        body: JSON.stringify({ title: row.title })
      });
      if (result.image) row.image = result.image;
      if (Number(result.rating) > 0) row.rating = Number(result.rating);
      if (Number(result.heat) >= 0) row.heat = Number(result.heat);
      if (result.category && result.category !== "其他") row.category = result.category;
      if (Number(result.year) > 0) row.year = Number(result.year);
      row.status = "ready";
      row.note = `已匹配：${result.matchedTitle || row.title}${result.note ? ` · ${result.note}` : ""}`;
    } catch (error) {
      row.status = "error";
      row.note = error.message || "联网补全失败，可手动填写后继续发布";
      if (!quiet) importer.message = row.note;
      if (!quiet) importer.messageType = "error";
    }
    render();
  }

  async function enrichAll() {
    if (importer.running) return;
    importer.running = true;
    importer.message = "正在逐条联网补全资料…";
    importer.messageType = "normal";
    render();
    for (let index = 0; index < importer.rows.length; index += 1) {
      if (!importer.rows[index].selected) continue;
      await enrichOne(index, true);
    }
    importer.running = false;
    const failed = selectedRows().filter((row) => row.status === "error").length;
    importer.message = failed ? `补全完成，${failed} 条未找到完全匹配资料，可手动填写后发布。` : "全部资料补全完成。";
    importer.messageType = failed ? "warning" : "success";
    render();
  }

  function mergeResource(row, maxIdRef) {
    const existing = existingResource(row.title);
    const quark = sourceFor("quark", Boolean(row.quark));
    const baidu = sourceFor("baidu", Boolean(row.baidu));
    if (row.quark && !quark) throw new Error("后台缺少“夸克网盘”来源，且当前账号没有视觉与分类权限，无法自动创建");
    if (row.baidu && !baidu) throw new Error("后台缺少“百度网盘”来源，且当前账号没有视觉与分类权限，无法自动创建");
    const links = { ...(existing?.links || {}) };
    if (quark && row.quark) links[quark.id] = row.quark;
    if (baidu && row.baidu) links[baidu.id] = row.baidu;
    const resource = {
      ...(existing || {}),
      id: existing?.id ?? ++maxIdRef.value,
      title: row.title.trim(),
      artTitle: (row.artTitle || row.title).trim().slice(0, 60),
      category: row.category || existing?.category || defaultCategory(),
      update: row.update || existing?.update || "持续更新",
      heat: Number(row.heat) || 0,
      rating: Number(row.rating) || 0,
      year: Number(row.year) || Number(existing?.year) || 0,
      image: row.image || existing?.image || "",
      colors: existing?.colors || ["#26354f", "#7786a5"],
      links,
      recommendedSourceId: quark && row.quark ? quark.id : baidu && row.baidu ? baidu.id : existing?.recommendedSourceId || "",
      visible: true
    };
    if (existing) {
      const index = state.config.resources.findIndex((item) => String(item.id) === String(existing.id));
      state.config.resources[index] = resource;
      return "updated";
    }
    state.config.resources.unshift(resource);
    return "added";
  }

  async function publish() {
    if (importer.publishing) return;
    const rows = selectedRows();
    if (!rows.length) return;
    importer.publishing = true;
    importer.message = "正在写入后台并发布前台数据…";
    importer.messageType = "normal";
    render();
    try {
      const maxIdRef = { value: Math.max(0, ...(state.config.resources || []).map((item) => Number(item.id) || 0)) };
      let added = 0;
      let updated = 0;
      for (const row of rows) {
        const result = mergeResource(row, maxIdRef);
        if (result === "added") added += 1;
        else updated += 1;
      }
      state.config.categoryOrder = [...new Set([...(state.config.categoryOrder || []), ...rows.map((row) => row.category).filter(Boolean)])];
      const result = await api("/api/admin/config", { method: "PUT", body: JSON.stringify(state.config) });
      state.config = result.config;
      renderAll();
      markSaved();
      importer.rows.forEach((row) => { row.existingId = existingResource(row.title)?.id || row.existingId; });
      importer.message = `发布成功：新增 ${added} 条，覆盖更新 ${updated} 条，前台已生效。`;
      importer.messageType = "success";
      showToast("智能批量导入发布成功");
    } catch (error) {
      importer.message = error.message || "发布失败";
      importer.messageType = "error";
      showToast(importer.message, "error");
    } finally {
      importer.publishing = false;
      render();
    }
  }

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (target.id === "smartImportFile" && target.files?.[0]) chooseFile(target.files[0]);
    const container = target.closest("[data-import-index]");
    if (!container || !target.dataset.importField) return;
    const row = importer.rows[Number(container.dataset.importIndex)];
    const field = target.dataset.importField;
    row[field] = field === "selected" ? target.checked : ["rating", "heat"].includes(field) ? Number(target.value) : target.value;
    if (field === "title") row.existingId = existingResource(row.title)?.id || null;
    render();
  });

  root.addEventListener("input", (event) => {
    const target = event.target;
    const container = target.closest("[data-import-index]");
    if (!container || !target.dataset.importField || target.type === "checkbox") return;
    const row = importer.rows[Number(container.dataset.importIndex)];
    const field = target.dataset.importField;
    row[field] = ["rating", "heat"].includes(field) ? Number(target.value) : target.value;
    if (field === "title") row.existingId = existingResource(row.title)?.id || null;
  });

  root.addEventListener("click", (event) => {
    const action = event.target.closest("[data-import-action]")?.dataset.importAction;
    if (!action) return;
    if (action === "select-all") { importer.rows.forEach((row) => { row.selected = true; }); render(); }
    if (action === "clear-all") { importer.rows.forEach((row) => { row.selected = false; }); render(); }
    if (action === "enrich-all") enrichAll();
    if (action === "publish") publish();
    if (action === "enrich") {
      const container = event.target.closest("[data-import-index]");
      enrichOne(Number(container.dataset.importIndex));
    }
  });

  document.querySelector('[data-panel-target="importPanel"]')?.addEventListener("click", render);
  render();
})();
