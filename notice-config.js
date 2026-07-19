(() => {
  "use strict";

  const KEY = "resourceExpiryNotice";
  const DEFAULT_TEXT = "⚠️ 资源10分钟失效，请尽快保存！";
  const ADMIN_FIELD_ID = "resourceExpiryNoticeField";
  const PUBLIC_MARKER = "data-configurable-expiry-notice";

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalize(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  async function fetchConfig(admin) {
    const response = await fetch(admin ? "/api/admin/config" : "/api/config", {
      credentials: "same-origin",
      cache: "no-store"
    });
    if (!response.ok) throw new Error("配置暂不可用");
    return response.json();
  }

  function noticeText(config) {
    return normalize(config?.settings?.[KEY]) || DEFAULT_TEXT;
  }

  // ---------- Admin field ----------
  function createAdminSection(value) {
    const section = document.createElement("div");
    section.className = "editor-section";
    section.id = ADMIN_FIELD_ID;
    section.innerHTML = `
      <div class="section-title">
        <div>
          <h3>资源失效提醒</h3>
          <p>设置资源链接弹窗中的红色提醒文字。</p>
        </div>
      </div>
      <div class="form-grid">
        <label class="field wide">
          <span>资源失效提醒文案</span>
          <textarea data-setting="${KEY}" rows="3"
            placeholder="${escapeHtml(DEFAULT_TEXT)}">${escapeHtml(value)}</textarea>
        </label>
      </div>
    `;
    return section;
  }

  let adminLoading = false;

  async function ensureAdminField() {
    if (!location.pathname.startsWith("/admin")) return;
    if (document.getElementById(ADMIN_FIELD_ID) || adminLoading) return;

    const host = document.querySelector("#settingsEditor");
    if (!host || !host.children.length) return;

    adminLoading = true;
    try {
      const config = await fetchConfig(true);
      host.appendChild(createAdminSection(noticeText(config)));
    } catch {
      // Login may not have finished yet. The next retry will add the field.
    } finally {
      adminLoading = false;
    }
  }

  function startAdmin() {
    ensureAdminField();
    const timer = setInterval(() => {
      ensureAdminField();
      if (document.getElementById(ADMIN_FIELD_ID)) {
        // Keep checking slowly because admin.js re-renders this panel after saving.
        clearInterval(timer);
        setInterval(ensureAdminField, 1500);
      }
    }, 500);
  }

  // ---------- Public modal ----------
  function isExpiryText(text) {
    const value = normalize(text);
    return (
      /资源.*分钟.*失效/.test(value) ||
      /请尽快保存/.test(value) ||
      value === DEFAULT_TEXT
    );
  }

  function findExistingNotice() {
    const marked = document.querySelector(`[${PUBLIC_MARKER}]`);
    if (marked) return marked;

    return [...document.querySelectorAll("div,p,span,strong,small")]
      .filter((element) => {
        const text = normalize(element.textContent);
        if (!text || text.length > 100 || !isExpiryText(text)) return false;
        return ![...element.children].some((child) => isExpiryText(child.textContent));
      })[0] || null;
  }

  function findResourceDialog() {
    const action = [...document.querySelectorAll("button,a")]
      .find((element) => /复制链接|打开链接/.test(normalize(element.textContent)));

    if (!action) return null;

    return action.closest(
      '[role="dialog"],dialog,.modal,.modal-card,.modal-content,.resource-modal,.resource-dialog'
    ) || action.parentElement?.parentElement?.parentElement || null;
  }

  function insertNotice(dialog, text) {
    if (!dialog || dialog.querySelector(`[${PUBLIC_MARKER}]`)) return;

    const notice = document.createElement("div");
    notice.setAttribute(PUBLIC_MARKER, "true");
    notice.textContent = text;

    Object.assign(notice.style, {
      margin: "12px 0 0",
      padding: "10px 12px",
      border: "0",
      borderRadius: "10px",
      color: "#8a5a00",
      background: "#fff8e8",
      fontSize: "12px",
      fontWeight: "600",
      lineHeight: "1.55",
      textAlign: "center",
      boxShadow: "none"
    });

    const closeButton = [...dialog.querySelectorAll("button")]
      .find((button) => normalize(button.textContent) === "关闭");

    if (closeButton) {
      const closeArea = closeButton.parentElement || closeButton;
      closeArea.insertAdjacentElement("beforebegin", notice);
    } else {
      dialog.appendChild(notice);
    }
  }

  let currentText = DEFAULT_TEXT;
  let publicTimer = null;

  function applyPublicNotice() {
    const existing = findExistingNotice();
    if (existing) {
      existing.setAttribute(PUBLIC_MARKER, "true");
      if (normalize(existing.textContent) !== currentText) {
        existing.textContent = currentText;
      }
      return;
    }

    insertNotice(findResourceDialog(), currentText);
  }

  function schedulePublicApply(delay = 80) {
    clearTimeout(publicTimer);
    publicTimer = setTimeout(applyPublicNotice, delay);
  }

  async function startPublic() {
    try {
      currentText = noticeText(await fetchConfig(false));
    } catch {
      currentText = DEFAULT_TEXT;
    }

    applyPublicNotice();

    document.addEventListener("click", () => {
      schedulePublicApply(50);
      setTimeout(applyPublicNotice, 180);
      setTimeout(applyPublicNotice, 450);
    }, true);

    const observer = new MutationObserver(() => schedulePublicApply());
    observer.observe(document.body, { childList: true, subtree: true });

    // Refresh only the setting value; this does not modify resource rendering.
    setInterval(async () => {
      try {
        const next = noticeText(await fetchConfig(false));
        if (next !== currentText) {
          currentText = next;
          applyPublicNotice();
        }
      } catch {
        // Ignore a temporary service wake-up/network failure.
      }
    }, 20000);
  }

  const start = () => {
    if (location.pathname.startsWith("/admin")) startAdmin();
    else startPublic();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
