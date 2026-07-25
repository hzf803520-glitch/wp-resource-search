(() => {
  const fileInput = document.querySelector("#syncCsvFile");
  const importButton = document.querySelector("#importSyncCsvButton");
  const status = document.querySelector("#syncCsvStatus");
  if (!fileInput || !importButton) return;

  const aliases = {
    title: ["剧名", "电视剧名字", "资源名称", "标题"],
    platform: ["平台", "网盘", "网盘平台"],
    sourceUrl: ["原链接", "原分享链接", "源链接"],
    targetUrl: ["我的新链接", "新分享链接", "新链接", "转存链接"],
    targetCode: ["新提取码", "提取码"],
    state: ["状态"],
    message: ["说明", "更新说明"]
  };

  const platformInfo = [
    { code: "quark", names: ["夸克"], label: "夸克网盘" },
    { code: "baidu", names: ["百度"], label: "百度网盘" },
    { code: "uc", names: ["uc", "UC"], label: "UC网盘" },
    { code: "xunlei", names: ["迅雷"], label: "迅雷云盘" }
  ];

  function show(message, type = "normal") {
    if (!status) return;
    status.textContent = message;
    status.style.color = type === "error" ? "#c8424f" : "#59606d";
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "请求失败");
    return payload;
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
        } else if (char === '"') {
          quoted = false;
        } else {
          cell += char;
        }
        continue;
      }
      if (char === '"') {
        quoted = true;
      } else if (char === ",") {
        row.push(cell);
        cell = "";
      } else if (char === "\n") {
        row.push(cell.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }
    if (cell || row.length) {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
    }
    return rows.filter((item) => item.some((value) => String(value).trim()));
  }

  function columnIndex(headers, names) {
    const normalized = headers.map((item) => String(item || "").trim());
    for (const name of names) {
      const index = normalized.indexOf(name);
      if (index >= 0) return index;
    }
    return -1;
  }

  function resolveColumns(headers) {
    const result = {};
    for (const [key, names] of Object.entries(aliases)) result[key] = columnIndex(headers, names);
    if (result.title < 0 || result.platform < 0 || result.sourceUrl < 0 || result.targetUrl < 0) {
      throw new Error("CSV缺少必要列：剧名、平台、原链接、我的新链接");
    }
    return result;
  }

  function valueAt(row, index) {
    return index >= 0 ? String(row[index] || "").trim() : "";
  }

  function platformFromLabel(label) {
    const text = String(label || "").trim();
    return platformInfo.find((item) => item.names.some((name) => text.toLowerCase().includes(name.toLowerCase()))) || null;
  }

  function hashId(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return 1000000000 + (hash >>> 0) % 900000000;
  }

  function ensureSource(config, info) {
    let source = (config.sources || []).find((item) => {
      const label = String(item.label || "").toLowerCase();
      return item.id === info.code || info.names.some((name) => label.includes(name.toLowerCase()));
    });
    if (source) return source;
    if ((config.sources || []).length >= 12) throw new Error(`网盘来源已达到上限，无法自动添加${info.label}`);
    source = { id: info.code, label: info.label, defaultLink: "" };
    config.sources.push(source);
    return source;
  }

  function normalizeRows(rows) {
    if (rows.length < 2) throw new Error("CSV没有可导入的数据");
    const columns = resolveColumns(rows[0]);
    const parsed = [];
    for (const row of rows.slice(1)) {
      const title = valueAt(row, columns.title);
      const platformLabel = valueAt(row, columns.platform);
      const sourceUrl = valueAt(row, columns.sourceUrl);
      const targetUrl = valueAt(row, columns.targetUrl);
      const info = platformFromLabel(platformLabel);
      if (!title || !info || !sourceUrl || !targetUrl) continue;
      parsed.push({
        title,
        info,
        sourceUrl,
        targetUrl,
        targetCode: valueAt(row, columns.targetCode),
        state: valueAt(row, columns.state),
        message: valueAt(row, columns.message)
      });
    }
    if (!parsed.length) throw new Error("CSV中没有可用的新分享链接");
    return parsed;
  }

  function groupRows(rows) {
    const groups = new Map();
    for (const item of rows) {
      const key = item.title.trim().toLowerCase();
      if (!groups.has(key)) groups.set(key, { title: item.title.trim(), items: [] });
      groups.get(key).items.push(item);
    }
    return [...groups.values()];
  }

  function resourceHasIncomingLink(resource, group) {
    const existingLinks = new Set(Object.values(resource.links || {}).map((item) => String(item || "").trim()).filter(Boolean));
    return group.items.some((item) => existingLinks.has(item.targetUrl));
  }

  function mergeGroup(config, group) {
    const sourceKeys = group.items.map((item) => `${item.info.code}|${item.sourceUrl}`).sort();
    const deterministicId = hashId(sourceKeys.join("||"));
    let resource = (config.resources || []).find((item) => Number(item.id) === deterministicId);
    if (!resource) resource = (config.resources || []).find((item) => resourceHasIncomingLink(item, group));
    if (!resource) resource = (config.resources || []).find((item) => String(item.title || "").trim().toLowerCase() === group.title.toLowerCase());

    const isNew = !resource;
    if (isNew) {
      resource = {
        id: deterministicId,
        title: group.title,
        artTitle: group.title.slice(0, 60),
        category: config.categoryOrder?.[0] || "其他",
        update: "持续更新",
        heat: 0,
        rating: 8,
        year: 0,
        image: "",
        colors: ["#26354f", "#7786a5"],
        links: {},
        visible: true
      };
      config.resources.unshift(resource);
    }

    const oldTitle = String(resource.title || "");
    resource.title = group.title;
    if (!resource.artTitle || resource.artTitle === oldTitle) resource.artTitle = group.title.slice(0, 60);
    resource.links = resource.links || {};
    resource.visible = true;

    for (const item of group.items) {
      const source = ensureSource(config, item.info);
      resource.links[source.id] = item.targetUrl;
    }

    const latestMessage = group.items.map((item) => item.message).find(Boolean);
    if (latestMessage && (!resource.update || resource.update === "持续更新")) resource.update = latestMessage.slice(0, 80);
    return isNew ? "added" : "updated";
  }

  importButton.addEventListener("click", async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      show("请先选择从网盘同步系统导出的CSV文件", "error");
      return;
    }
    importButton.disabled = true;
    importButton.textContent = "正在判定并保存...";
    try {
      const text = await file.text();
      const rows = normalizeRows(parseCsv(text));
      const groups = groupRows(rows);
      const config = await requestJson("/api/admin/config");
      config.resources = Array.isArray(config.resources) ? config.resources : [];
      config.sources = Array.isArray(config.sources) ? config.sources : [];
      let added = 0;
      let updated = 0;
      for (const group of groups) {
        const result = mergeGroup(config, group);
        if (result === "added") added += 1;
        else updated += 1;
      }
      await requestJson("/api/admin/config", { method: "PUT", body: JSON.stringify(config) });
      show(`导入完成：旧资源修改保存 ${updated} 条，新资源添加 ${added} 条。页面即将刷新。`);
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      show(error.message || "CSV导入失败", "error");
    } finally {
      importButton.disabled = false;
      importButton.textContent = "判定旧资源并导入";
    }
  });
})();
