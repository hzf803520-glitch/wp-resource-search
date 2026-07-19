(() => {
  "use strict";

  const SETTING_KEY = "resourceExpiryNotice";
  const DEFAULT_NOTICE = "⚠️ 资源10分钟失效，请尽快保存！";
  const ADMIN_EDITOR_ID = "resourceExpiryNoticeEditor";
  const FRONT_NOTICE_CLASS = "configurable-expiry-notice";

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function readConfig(admin = false) {
    const response = await fetch(admin ? "/api/admin/config" : "/api/config", {
      credentials: "same-origin",
      cache: "no-store"
    });
    if (!response.ok) throw new Error("配置暂不可用");
    return response.json();
  }

  function configuredNotice(config) {
    const value = String(config?.settings?.[SETTING_KEY] || "").trim();
    return value || DEFAULT_NOTICE;
  }

  function containsNoticeText(element) {
    const text = String(element?.textContent || "").replace(/\s+/g, "");
    return /资源.*分钟.*失效/.test(text) || /请尽快保存/.test(text);
  }

  function smallestExistingNotice() {
    const candidates = [...document.querySelectorAll("div,p,span,strong,small")]
      .filter((element) => containsNoticeText(element))
      .filter((element) => ![...element.children].some((child) => containsNoticeText(child)));
    return candidates[0] || null;
  }

  function findCopyButton() {
    return [...document.querySelectorAll("button,a")]
      .find((element) => /复制链接/.test(String(element.textContent || "")));
  }

  function findDialog(element) {
    if (!element) return null;
    return element.closest(
      '[role="dialog"], dialog, .modal, .modal-card, .resource-modal, .resource-dialog, .modal-content'
    ) || element.parentElement?.parentElement?.parentElement || null;
  }

  function createNotice(dialog, copyButton) {
    if (!dialog || dialog.querySelector(`.${FRONT_NOTICE_CLASS}`)) return null;

    const notice = document.createElement("div");
    notice.className = FRONT_NOTICE_CLASS;
    Object.assign(notice.style, {
      margin: "12px 0 0",
      padding: "10px 12px",
      border: "1px solid #ff4d4f",
      borderRadius: "6px",
      color: "#ff4d4f",
      background: "#fff7f7",
      fontSize: "13px",
      fontWeight: "700",
      lineHeight: "1.5",
      textAlign: "center"
    });

    const actions = copyButton?.parentElement;
    if (actions && dialog.contains(actions)) {
      actions.insertAdjacentElement("afterend", notice);
    } else {
      dialog.appendChild(notice);
    }
    return notice;
  }

  function applyPublicNotice(noticeText) {
    const existing = smallestExistingNotice();
    if (existing) {
      existing.textContent = noticeText;
      existing.dataset.configurableNotice = "true";
      return;
    }

    const copyButton = findCopyButton();
    if (!copyButton) return;
    const dialog = findDialog(copyButton);
    const created = createNotice(dialog, copyButton);
    if (created) created.textContent = noticeText;
  }

  async function startPublicNotice() {
    let noticeText = DEFAULT_NOTICE;
    try {
      noticeText = configuredNotice(await readConfig(false));
    } catch {
      // Keep the safe default while the service is waking up.
    }

    applyPublicNotice(noticeText);
    const observer = new MutationObserver(() => applyPublicNotice(noticeText));
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Refresh the configured value periodically so a newly published value
    // appears without requiring a long-lived tab to be reopened.
    setInterval(async () => {
      try {
        noticeText = configuredNotice(await readConfig(false));
        applyPublicNotice(noticeText);
      } catch {
        // Ignore temporary network errors.
      }
    }, 15000);
  }

  function buildAdminEditor(value) {
    const section = document.createElement("div");
    section.className = "editor-section";
    section.id = ADMIN_EDITOR_ID;
    section.innerHTML = `
      <div class="section-title">
        <div>
          <h3>资源失效提醒</h3>
          <p>配置用户获取资源链接后看到的红色提醒文案。</p>
        </div>
      </div>
      <div class="form-grid">
        <label class="field wide">
          <span>资源失效提醒文案</span>
          <textarea data-setting="${SETTING_KEY}" rows="3"
            placeholder="${escapeHtml(DEFAULT_NOTICE)}">${escapeHtml(value)}</textarea>
        </label>
      </div>
    `;
    return section;
  }

  async function ensureAdminEditor() {
    const host = document.querySelector("#settingsEditor");
    if (!host || !host.children.length || document.querySelector(`#${ADMIN_EDITOR_ID}`)) return;

    try {
      const config = await readConfig(true);
      host.appendChild(buildAdminEditor(configuredNotice(config)));
    } catch {
      // The user may still be on the login screen. A later retry will add it.
    }
  }

  function startAdminEditor() {
    ensureAdminEditor();
    const observer = new MutationObserver(ensureAdminEditor);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(ensureAdminEditor, 1200);
  }

  const start = () => {
    if (location.pathname.startsWith("/admin")) {
      startAdminEditor();
    } else {
      startPublicNotice();
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
