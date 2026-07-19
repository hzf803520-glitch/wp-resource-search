(() => {
  "use strict";

  const KEYS = {
    title: "disclaimerTitle",
    paragraphOne: "disclaimerParagraphOne",
    paragraphTwo: "disclaimerParagraphTwo",
    closing: "disclaimerClosing"
  };

  const DEFAULTS = {
    title: "免责声明",
    paragraphOne: "本站所有内容均来自互联网，本站不会保存、复制或传播任何视频文件，也不对本站上的任何内容负法律责任。",
    paragraphTwo: "如果本站部分内容侵犯您的版权请告知，在必要证明文件下我们第一时间撤除，发布的内容仅做传播测试使用。",
    closing: "请支持购买正版!"
  };

  const ADMIN_SECTION_ID = "disclaimerSettingsSection";
  const PUBLIC_CARD_ID = "configurableDisclaimerCard";

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
      title: normalize(config?.settings?.[KEYS.title]) || DEFAULTS.title,
      paragraphOne: normalize(config?.settings?.[KEYS.paragraphOne]) || DEFAULTS.paragraphOne,
      paragraphTwo: normalize(config?.settings?.[KEYS.paragraphTwo]) || DEFAULTS.paragraphTwo,
      closing: normalize(config?.settings?.[KEYS.closing]) || DEFAULTS.closing
    };
  }

  // ---------------- Backend configuration ----------------

  function createAdminSection(values) {
    const section = document.createElement("div");
    section.className = "editor-section";
    section.id = ADMIN_SECTION_ID;
    section.innerHTML = `
      <div class="section-title">
        <div>
          <h3>底部免责声明</h3>
          <p>配置前台资源列表底部灰色圆角卡片中的全部文案。</p>
        </div>
      </div>
      <div class="form-grid">
        <label class="field wide">
          <span>免责声明标题</span>
          <input data-setting="${KEYS.title}" value="${escapeHtml(values.title)}" />
        </label>
        <label class="field wide">
          <span>第一段说明</span>
          <textarea data-setting="${KEYS.paragraphOne}" rows="4">${escapeHtml(values.paragraphOne)}</textarea>
        </label>
        <label class="field wide">
          <span>第二段版权说明</span>
          <textarea data-setting="${KEYS.paragraphTwo}" rows="4">${escapeHtml(values.paragraphTwo)}</textarea>
        </label>
        <label class="field wide">
          <span>底部加粗文案</span>
          <input data-setting="${KEYS.closing}" value="${escapeHtml(values.closing)}" />
        </label>
      </div>
    `;
    return section;
  }

  let adminLoading = false;

  async function ensureAdminSection() {
    if (!location.pathname.startsWith("/admin")) return;
    if (document.getElementById(ADMIN_SECTION_ID) || adminLoading) return;

    const host = document.querySelector("#settingsEditor");
    if (!host || !host.children.length) return;

    adminLoading = true;
    try {
      const config = await fetchConfig(true);
      host.appendChild(createAdminSection(valuesFromConfig(config)));
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

  // ---------------- Public disclaimer card ----------------

  function createCard(values) {
    const card = document.createElement("section");
    card.id = PUBLIC_CARD_ID;
    card.setAttribute("aria-label", values.title);

    Object.assign(card.style, {
      width: "calc(100% - 24px)",
      maxWidth: "520px",
      boxSizing: "border-box",
      margin: "12px auto 18px",
      padding: "18px 16px 16px",
      border: "0",
      borderRadius: "12px",
      color: "#6f737b",
      background: "#f2f2f3",
      boxShadow: "none"
    });

    card.innerHTML = `
      <h2 style="
        margin:0 0 10px;
        color:#666a71;
        font-size:15px;
        font-weight:800;
        line-height:1.5;
        text-align:center;
      ">${escapeHtml(values.title)}</h2>

      <p style="
        margin:0;
        color:#777b82;
        font-size:12px;
        font-weight:400;
        line-height:1.8;
        text-align:left;
      ">${escapeHtml(values.paragraphOne)}</p>

      <p style="
        margin:4px 0 0;
        color:#777b82;
        font-size:12px;
        font-weight:400;
        line-height:1.8;
        text-align:left;
      ">${escapeHtml(values.paragraphTwo)}</p>

      <strong style="
        display:block;
        margin-top:7px;
        color:#666a71;
        font-size:12px;
        font-weight:800;
        line-height:1.6;
        text-align:center;
      ">${escapeHtml(values.closing)}</strong>
    `;

    return card;
  }

  function findFooterTarget() {
    const footerText = document.querySelector("#footerText");
    if (footerText) {
      return {
        element: footerText.closest("footer") || footerText.parentElement,
        replace: true
      };
    }

    const footer = document.querySelector("footer, .site-footer, .page-footer");
    if (footer) return { element: footer, replace: true };

    const preferredHost = document.querySelector(
      ".app-shell, .page-shell, .home-shell, .content-shell, main"
    );

    return {
      element: preferredHost || document.body,
      replace: false
    };
  }

  function renderCard(values) {
    const current = document.getElementById(PUBLIC_CARD_ID);
    if (current) current.remove();

    const target = findFooterTarget();
    if (!target.element) return;

    const card = createCard(values);

    if (target.replace) {
      target.element.replaceChildren(card);
    } else {
      target.element.appendChild(card);
    }
  }

  async function startPublic() {
    let values = DEFAULTS;

    try {
      values = valuesFromConfig(await fetchConfig(false));
    } catch {
      values = DEFAULTS;
    }

    // Wait until the original page has finished rendering its resource lists and footer.
    setTimeout(() => renderCard(values), 250);
    setTimeout(() => renderCard(values), 900);

    // If the application re-renders its footer, restore the configured card only.
    const observer = new MutationObserver(() => {
      if (!document.getElementById(PUBLIC_CARD_ID)) {
        setTimeout(() => renderCard(values), 80);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setInterval(async () => {
      try {
        const nextValues = valuesFromConfig(await fetchConfig(false));
        if (JSON.stringify(nextValues) !== JSON.stringify(values)) {
          values = nextValues;
          renderCard(values);
        }
      } catch {
        // Ignore temporary wake-up or connection failures.
      }
    }, 20000);
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
