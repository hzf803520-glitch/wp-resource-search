(() => {
  "use strict";

  // Build: refined white join-group card, kept inside the phone page boundary.

  const KEYS = {
    enabled: "qrPromoEnabled",
    image: "qrPromoImage",
    floatingText: "qrPromoFloatingText",
    floatingSubtext: "qrPromoFloatingSubtext",
    title: "qrPromoTitle",
    groupName: "qrPromoGroupName",
    description: "qrPromoDescription"
  };

  const DEFAULTS = {
    enabled: "show",
    image: "",
    floatingText: "加入资源群",
    floatingSubtext: "扫码进群",
    title: "扫码进群（防止失联）",
    groupName: "资源交流群",
    description: "二维码如有更新，请以页面最新内容为准"
  };

  const ADMIN_SECTION_ID = "qrPromoSettingsSection";
  const FLOATING_ID = "qrPromoFloatingButton";
  const MODAL_ID = "qrPromoModal";
  const STYLE_ID = "qrPromoStyles";

  let currentValues = { ...DEFAULTS };
  let adminLoading = false;
  let publicRefreshTimer = null;

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

  function validImage(value) {
    const image = String(value || "").trim();
    return (
      image.startsWith("data:image/") ||
      image.startsWith("https://") ||
      image.startsWith("http://") ||
      image.startsWith("/")
    ) ? image : "";
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
    const enabledValue = normalize(config?.settings?.[KEYS.enabled]);
    return {
      enabled: enabledValue === "hide" ? "hide" : DEFAULTS.enabled,
      image: validImage(config?.settings?.[KEYS.image]),
      floatingText: normalize(config?.settings?.[KEYS.floatingText]) || DEFAULTS.floatingText,
      floatingSubtext: normalize(config?.settings?.[KEYS.floatingSubtext]) || DEFAULTS.floatingSubtext,
      title: normalize(config?.settings?.[KEYS.title]) || DEFAULTS.title,
      groupName: normalize(config?.settings?.[KEYS.groupName]) || DEFAULTS.groupName,
      description: normalize(config?.settings?.[KEYS.description]) || DEFAULTS.description
    };
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => reject(new Error("二维码图片读取失败"));
      reader.onload = () => {
        const image = new Image();

        image.onerror = () => reject(new Error("二维码图片格式不正确"));
        image.onload = () => {
          const maxEdge = 1000;
          const sourceWidth = image.naturalWidth || image.width;
          const sourceHeight = image.naturalHeight || image.height;
          const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
          const width = Math.max(1, Math.round(sourceWidth * scale));
          const height = Math.max(1, Math.round(sourceHeight * scale));

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const context = canvas.getContext("2d", { alpha: false });
          if (!context) {
            resolve(String(reader.result || ""));
            return;
          }

          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, width, height);
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          context.drawImage(image, 0, 0, width, height);

          const output = canvas.toDataURL("image/webp", 0.86);
          resolve(output || String(reader.result || ""));
        };

        image.src = String(reader.result || "");
      };

      reader.readAsDataURL(file);
    });
  }

  // ---------------- Backend configuration ----------------

  function createAdminSection(values) {
    const section = document.createElement("div");
    section.className = "editor-section";
    section.id = ADMIN_SECTION_ID;
    section.innerHTML = `
      <div class="section-title">
        <div>
          <h3>扫码进群浮窗</h3>
          <p>配置前台右下角二维码入口、弹窗内容以及显示状态。</p>
        </div>
      </div>

      <div class="form-grid">
        <label class="field">
          <span>前台显示状态</span>
          <select data-setting="${KEYS.enabled}" id="qrPromoEnabledField">
            <option value="show"${values.enabled === "show" ? " selected" : ""}>显示</option>
            <option value="hide"${values.enabled === "hide" ? " selected" : ""}>隐藏</option>
          </select>
        </label>

        <label class="field">
          <span>悬浮按钮主文案</span>
          <input data-setting="${KEYS.floatingText}" value="${escapeHtml(values.floatingText)}" />
        </label>

        <label class="field">
          <span>悬浮按钮副文案</span>
          <input data-setting="${KEYS.floatingSubtext}" value="${escapeHtml(values.floatingSubtext)}" />
        </label>

        <label class="field wide">
          <span>弹窗标题</span>
          <input data-setting="${KEYS.title}" value="${escapeHtml(values.title)}" />
        </label>

        <label class="field wide">
          <span>群名称或说明</span>
          <input data-setting="${KEYS.groupName}" value="${escapeHtml(values.groupName)}" />
        </label>

        <label class="field wide">
          <span>二维码底部说明</span>
          <textarea data-setting="${KEYS.description}" rows="3">${escapeHtml(values.description)}</textarea>
        </label>

        <div class="field wide">
          <span>二维码图片</span>
          <div style="
            display:grid;
            grid-template-columns:110px minmax(0,1fr);
            gap:14px;
            align-items:center;
            margin-top:8px;
          ">
            <div id="qrPromoAdminPreview" style="
              display:grid;
              width:110px;
              height:110px;
              place-items:center;
              overflow:hidden;
              border:1px solid #e4e7ec;
              border-radius:12px;
              color:#9aa0aa;
              background:#f6f7f9;
              font-size:12px;
              text-align:center;
            ">
              ${
                values.image
                  ? `<img src="${escapeHtml(values.image)}" alt="二维码预览" style="width:100%;height:100%;object-fit:contain;background:#fff;" />`
                  : "暂未上传<br>二维码"
              }
            </div>

            <div>
              <label style="
                display:inline-flex;
                min-height:40px;
                align-items:center;
                justify-content:center;
                border-radius:9px;
                padding:0 16px;
                color:#fff;
                background:#ff755f;
                font-size:13px;
                font-weight:700;
                cursor:pointer;
              ">
                上传二维码图片
                <input id="qrPromoFileInput" type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style="display:none;" />
              </label>

              <button id="qrPromoClearImage" type="button" style="
                min-height:40px;
                margin-left:8px;
                border:1px solid #e0e3e8;
                border-radius:9px;
                padding:0 14px;
                color:#6b7280;
                background:#fff;
                cursor:pointer;
              ">清除图片</button>

              <p style="margin:9px 0 0;color:#9197a1;font-size:12px;line-height:1.6;">
                建议上传清晰的正方形二维码图片。上传后仍需点击右上角“保存并发布”。
              </p>
            </div>
          </div>

          <textarea data-setting="${KEYS.image}" id="qrPromoImageValue"
            style="display:none;">${escapeHtml(values.image)}</textarea>
        </div>
      </div>
    `;

    return section;
  }

  function dispatchSettingInput(field) {
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function updateAdminPreview(imageValue) {
    const preview = document.getElementById("qrPromoAdminPreview");
    if (!preview) return;

    if (imageValue) {
      preview.innerHTML = "";
      const image = document.createElement("img");
      image.src = imageValue;
      image.alt = "二维码预览";
      Object.assign(image.style, {
        width: "100%",
        height: "100%",
        objectFit: "contain",
        background: "#fff"
      });
      preview.appendChild(image);
    } else {
      preview.innerHTML = "暂未上传<br>二维码";
    }
  }

  function bindAdminSection() {
    const fileInput = document.getElementById("qrPromoFileInput");
    const imageField = document.getElementById("qrPromoImageValue");
    const clearButton = document.getElementById("qrPromoClearImage");
    const enabledField = document.getElementById("qrPromoEnabledField");

    if (enabledField && !enabledField.dataset.bound) {
      enabledField.dataset.bound = "true";
      enabledField.addEventListener("change", () => dispatchSettingInput(enabledField));
    }

    if (fileInput && imageField && !fileInput.dataset.bound) {
      fileInput.dataset.bound = "true";

      fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        if (!file) return;

        if (file.size > 8 * 1024 * 1024) {
          alert("二维码图片不能超过8MB");
          fileInput.value = "";
          return;
        }

        fileInput.disabled = true;

        try {
          const dataUrl = await compressImage(file);

          if (!dataUrl || dataUrl.length > 3 * 1024 * 1024) {
            throw new Error("图片处理后仍然过大，请换一张更小的图片");
          }

          imageField.value = dataUrl;
          dispatchSettingInput(imageField);
          updateAdminPreview(dataUrl);
        } catch (error) {
          alert(error.message || "二维码图片处理失败");
        } finally {
          fileInput.disabled = false;
          fileInput.value = "";
        }
      });
    }

    if (clearButton && imageField && !clearButton.dataset.bound) {
      clearButton.dataset.bound = "true";

      clearButton.addEventListener("click", () => {
        imageField.value = "";
        dispatchSettingInput(imageField);
        updateAdminPreview("");
      });
    }
  }

  async function ensureAdminSection() {
    if (!location.pathname.startsWith("/admin")) return;

    const existing = document.getElementById(ADMIN_SECTION_ID);
    if (existing) {
      bindAdminSection();
      return;
    }

    if (adminLoading) return;

    const host = document.querySelector("#settingsEditor");
    if (!host || !host.children.length) return;

    adminLoading = true;

    try {
      const config = await fetchConfig(true);
      host.appendChild(createAdminSection(valuesFromConfig(config)));
      bindAdminSection();
    } catch {
      // Login or admin page rendering may still be in progress.
    } finally {
      adminLoading = false;
    }
  }

  function startAdmin() {
    ensureAdminSection();
    setInterval(ensureAdminSection, 1000);
  }

  // ---------------- Public floating QR and modal ----------------

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .qr-promo-floating {
        position: fixed;
        z-index: 9000;
        right: auto;
        left: 14px;
        bottom: 82px;
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr) 18px;
        align-items: center;
        gap: 10px;
        min-width: 158px;
        min-height: 62px;
        box-sizing: border-box;
        border: 1px solid rgba(255, 126, 91, .14);
        border-radius: 18px;
        padding: 8px 10px 8px 8px;
        color: #2f3540;
        background: rgba(255, 255, 255, .96);
        box-shadow:
          0 12px 30px rgba(44, 54, 72, .16),
          0 2px 8px rgba(255, 126, 91, .10);
        backdrop-filter: blur(10px);
        cursor: pointer;
        text-align: left;
        transition:
          transform .18s ease,
          box-shadow .18s ease,
          border-color .18s ease;
      }
      .qr-promo-floating::after {
        content: "›";
        display: grid;
        width: 18px;
        height: 18px;
        place-items: center;
        color: #ff7b5f;
        font-size: 22px;
        font-weight: 500;
        line-height: 1;
      }
      .qr-promo-floating:hover {
        transform: translateY(-2px);
        border-color: rgba(255, 126, 91, .28);
        box-shadow:
          0 16px 36px rgba(44, 54, 72, .20),
          0 4px 12px rgba(255, 126, 91, .14);
      }
      .qr-promo-floating:active {
        transform: scale(.98);
      }
      .qr-promo-floating-icon {
        position: relative;
        display: grid;
        width: 44px;
        height: 44px;
        place-items: center;
        border-radius: 14px;
        color: #fff;
        background: linear-gradient(145deg, #ff6f5e, #ff9d67);
        box-shadow: 0 7px 16px rgba(255, 115, 91, .26);
        font-size: 21px;
        line-height: 1;
      }
      .qr-promo-floating-icon::after {
        content: "";
        position: absolute;
        top: 4px;
        right: 4px;
        width: 7px;
        height: 7px;
        border: 2px solid #fff;
        border-radius: 50%;
        background: #35c96f;
        box-shadow: 0 0 0 2px rgba(53, 201, 111, .14);
      }
      .qr-promo-floating-copy {
        min-width: 0;
      }
      .qr-promo-floating-copy strong {
        display: block;
        overflow: hidden;
        color: #2d3440;
        font-size: 14px;
        font-weight: 800;
        line-height: 1.35;
        letter-spacing: .1px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .qr-promo-floating-copy small {
        display: block;
        overflow: hidden;
        margin-top: 3px;
        color: #ff765d;
        font-size: 10px;
        font-weight: 600;
        line-height: 1.3;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .qr-promo-overlay {
        position: fixed;
        inset: 0;
        z-index: 13000;
        display: grid;
        place-items: center;
        padding: 18px;
        background: rgba(25, 30, 40, .58);
        backdrop-filter: blur(4px);
      }
      .qr-promo-overlay[hidden] { display: none !important; }
      .qr-promo-dialog {
        width: min(100%, 360px);
        max-height: min(90vh, 720px);
        overflow-y: auto;
        border-radius: 18px;
        padding: 22px 20px 16px;
        background: #fff;
        box-shadow: 0 26px 80px rgba(18, 24, 36, .28);
        text-align: center;
      }
      .qr-promo-dialog h2 {
        margin: 0;
        color: #2f3540;
        font-size: 19px;
        line-height: 1.45;
      }
      .qr-promo-mini {
        display: block;
        width: 58px;
        height: 58px;
        margin: 28px auto 8px;
        object-fit: contain;
        border-radius: 8px;
        background: #fff;
      }
      .qr-promo-group {
        margin: 0;
        color: #333944;
        font-size: 13px;
        font-weight: 700;
        line-height: 1.5;
      }
      .qr-promo-large {
        display: block;
        width: min(100%, 245px);
        aspect-ratio: 1;
        margin: 16px auto 0;
        object-fit: contain;
        background: #fff;
      }
      .qr-promo-description {
        margin: 12px 0 0;
        color: #b0b4bb;
        font-size: 10px;
        line-height: 1.6;
      }
      .qr-promo-close {
        width: 100%;
        min-height: 47px;
        margin-top: 24px;
        border: 0;
        border-radius: 11px;
        color: #626872;
        background: #eef0f3;
        font-size: 15px;
        font-weight: 800;
        cursor: pointer;
      }
      body.qr-promo-open { overflow: hidden; }
      @media (max-width: 480px) {
        .qr-promo-floating {
          right: auto;
          bottom: 78px;
          min-width: 148px;
          max-width: calc(100vw - 28px);
        }
        .qr-promo-overlay {
          align-items: end;
          padding: 0;
        }
        .qr-promo-dialog {
          width: 100%;
          max-height: 92vh;
          box-sizing: border-box;
          border-radius: 18px 18px 0 0;
          padding-bottom: calc(16px + env(safe-area-inset-bottom));
        }
      }
    `;

    document.head.appendChild(style);
  }

  function removePublicElements() {
    document.getElementById(FLOATING_ID)?.remove();
    document.getElementById(MODAL_ID)?.remove();
    document.body.classList.remove("qr-promo-open");
  }

  function closeModal() {
    const overlay = document.getElementById(MODAL_ID);
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("qr-promo-open");
  }

  function openModal() {
    const overlay = document.getElementById(MODAL_ID);
    if (!overlay) return;

    overlay.hidden = false;
    document.body.classList.add("qr-promo-open");
    overlay.querySelector(".qr-promo-close")?.focus();
  }

  function createModal(values) {
    const overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.className = "qr-promo-overlay";
    overlay.hidden = true;

    const dialog = document.createElement("section");
    dialog.className = "qr-promo-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", values.title);

    const title = document.createElement("h2");
    title.textContent = values.title;

    const miniImage = document.createElement("img");
    miniImage.className = "qr-promo-mini";
    miniImage.src = values.image;
    miniImage.alt = "";

    const groupName = document.createElement("p");
    groupName.className = "qr-promo-group";
    groupName.textContent = values.groupName;

    const largeImage = document.createElement("img");
    largeImage.className = "qr-promo-large";
    largeImage.src = values.image;
    largeImage.alt = "群二维码";

    const description = document.createElement("p");
    description.className = "qr-promo-description";
    description.textContent = values.description;

    const closeButton = document.createElement("button");
    closeButton.className = "qr-promo-close";
    closeButton.type = "button";
    closeButton.textContent = "关闭";

    dialog.append(title, miniImage, groupName, largeImage, description, closeButton);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    closeButton.addEventListener("click", closeModal);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeModal();
    });
  }

  function findPhonePageContainer() {
    const preferredSelectors = [
      ".app-shell",
      ".home-shell",
      ".search-shell",
      ".page-shell",
      ".mobile-shell",
      ".site-shell",
      "main"
    ];

    for (const selector of preferredSelectors) {
      const element = document.querySelector(selector);
      if (!element) continue;

      const rect = element.getBoundingClientRect();
      if (rect.width >= 280 && rect.width <= 700 && rect.height > 300) {
        return element;
      }
    }

    const candidates = [...document.querySelectorAll("body > div, body > main, body > section")]
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width >= 280 && rect.width <= 700 && rect.height > 400)
      .sort((left, right) => right.rect.height - left.rect.height);

    return candidates[0]?.element || document.documentElement;
  }

  function positionFloatingButton() {
    const button = document.getElementById(FLOATING_ID);
    if (!button) return;

    const container = findPhonePageContainer();
    const rect = container.getBoundingClientRect();
    const buttonWidth = button.offsetWidth || 142;
    const innerGap = 12;

    const minimumLeft = 8;
    const maximumLeft = Math.max(
      minimumLeft,
      window.innerWidth - buttonWidth - 8
    );

    const desiredLeft = rect.right - buttonWidth - innerGap;
    const left = Math.min(
      maximumLeft,
      Math.max(rect.left + innerGap, desiredLeft)
    );

    button.style.left = `${Math.round(left)}px`;
  }

  function scheduleFloatingPosition() {
    requestAnimationFrame(positionFloatingButton);
  }

  function createFloating(values) {
    const button = document.createElement("button");
    button.id = FLOATING_ID;
    button.className = "qr-promo-floating";
    button.type = "button";
    button.setAttribute("aria-label", `${values.floatingText}，${values.floatingSubtext}`);

    const icon = document.createElement("span");
    icon.className = "qr-promo-floating-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "👥";

    const copy = document.createElement("span");
    copy.className = "qr-promo-floating-copy";

    const title = document.createElement("strong");
    title.textContent = values.floatingText;

    const subtitle = document.createElement("small");
    subtitle.textContent = values.floatingSubtext;

    copy.append(title, subtitle);
    button.append(icon, copy);
    button.addEventListener("click", openModal);
    document.body.appendChild(button);
    scheduleFloatingPosition();
  }

  function renderPublic(values) {
    removePublicElements();

    if (values.enabled !== "show" || !values.image) return;

    ensureStyles();
    createFloating(values);
    createModal(values);
  }

  async function refreshPublic() {
    try {
      const nextValues = valuesFromConfig(await fetchConfig(false));
      const changed = JSON.stringify(nextValues) !== JSON.stringify(currentValues);

      currentValues = nextValues;

      if (changed || !document.getElementById(FLOATING_ID)) {
        renderPublic(currentValues);
      }
    } catch {
      // Keep the current visible state during a temporary network failure.
    }
  }

  function startPublic() {
    refreshPublic();

    publicRefreshTimer = setInterval(refreshPublic, 20000);

    window.addEventListener("resize", scheduleFloatingPosition, { passive: true });
    window.addEventListener("orientationchange", scheduleFloatingPosition);
    window.addEventListener("scroll", scheduleFloatingPosition, { passive: true });

    if ("ResizeObserver" in window) {
      const pageContainer = findPhonePageContainer();
      const resizeObserver = new ResizeObserver(scheduleFloatingPosition);
      resizeObserver.observe(pageContainer);
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
    });
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
