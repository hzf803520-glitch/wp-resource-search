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
        grid-template-columns: 46px minmax(0, 1fr) 18px;
        align-items: center;
        gap: 10px;
        min-width: 166px;
        min-height: 64px;
        box-sizing: border-box;
        border: 1px solid rgba(255, 118, 91, .18);
        border-radius: 19px;
        padding: 8px 10px 8px 8px;
        color: #2f3540;
        background:
          linear-gradient(135deg, rgba(255,255,255,.98), rgba(255,248,244,.98));
        box-shadow:
          0 15px 34px rgba(42, 52, 70, .17),
          0 4px 12px rgba(255, 118, 91, .12);
        backdrop-filter: blur(12px);
        cursor: pointer;
        text-align: left;
        transition:
          transform .2s ease,
          box-shadow .2s ease,
          border-color .2s ease;
      }
      .qr-promo-floating::before {
        content: "";
        position: absolute;
        inset: -1px;
        z-index: -1;
        border-radius: inherit;
        background: linear-gradient(130deg, rgba(255,120,91,.20), transparent 48%, rgba(73,201,145,.12));
        pointer-events: none;
      }
      .qr-promo-floating::after {
        content: "›";
        display: grid;
        width: 18px;
        height: 18px;
        place-items: center;
        color: #ff765d;
        font-size: 23px;
        font-weight: 700;
        line-height: 1;
      }
      .qr-promo-floating:hover {
        transform: translateY(-3px);
        border-color: rgba(255, 118, 91, .32);
        box-shadow:
          0 19px 40px rgba(42, 52, 70, .20),
          0 6px 15px rgba(255, 118, 91, .15);
      }
      .qr-promo-floating:active {
        transform: scale(.98);
      }
      .qr-promo-floating-icon {
        position: relative;
        display: grid;
        width: 46px;
        height: 46px;
        place-items: center;
        border-radius: 15px;
        color: #fff;
        background: linear-gradient(145deg, #ff6d59, #ffa26f);
        box-shadow: 0 8px 18px rgba(255, 112, 88, .28);
        font-size: 21px;
        line-height: 1;
      }
      .qr-promo-floating-icon::after {
        content: "";
        position: absolute;
        top: 4px;
        right: 4px;
        width: 8px;
        height: 8px;
        border: 2px solid #fff;
        border-radius: 50%;
        background: #35c96f;
        box-shadow: 0 0 0 3px rgba(53, 201, 111, .13);
      }
      .qr-promo-floating-copy {
        min-width: 0;
      }
      .qr-promo-floating-copy strong {
        display: block;
        overflow: hidden;
        color: #29313d;
        font-size: 14px;
        font-weight: 900;
        line-height: 1.35;
        letter-spacing: .1px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .qr-promo-floating-copy small {
        display: block;
        overflow: hidden;
        margin-top: 3px;
        color: #ff7259;
        font-size: 10px;
        font-weight: 700;
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
        background:
          radial-gradient(circle at 50% 24%, rgba(255,130,92,.16), transparent 32%),
          rgba(20, 27, 38, .66);
        backdrop-filter: blur(7px);
        animation: qrPromoFadeIn .2s ease both;
      }
      .qr-promo-overlay[hidden] {
        display: none !important;
      }

      .qr-promo-dialog {
        position: relative;
        width: min(100%, 382px);
        max-height: min(92vh, 760px);
        overflow-y: auto;
        box-sizing: border-box;
        border: 1px solid rgba(255,255,255,.88);
        border-radius: 26px;
        padding: 0 20px 18px;
        background:
          linear-gradient(180deg, #fff8f4 0, #ffffff 150px, #ffffff 100%);
        box-shadow:
          0 30px 90px rgba(12, 19, 32, .34),
          inset 0 1px 0 rgba(255,255,255,.9);
        text-align: center;
        animation: qrPromoPopIn .24s cubic-bezier(.2,.8,.25,1) both;
      }
      .qr-promo-dialog::before {
        content: "";
        position: absolute;
        top: -90px;
        left: 50%;
        width: 260px;
        height: 180px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255,128,92,.22), transparent 68%);
        transform: translateX(-50%);
        pointer-events: none;
      }

      .qr-promo-topbar {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 52px;
      }
      .qr-promo-top-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 1px solid rgba(255,118,91,.14);
        border-radius: 999px;
        padding: 5px 10px;
        color: #ff6e55;
        background: rgba(255,255,255,.78);
        font-size: 10px;
        font-weight: 800;
      }
      .qr-promo-top-badge::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #36c977;
        box-shadow: 0 0 0 4px rgba(54,201,119,.12);
      }
      .qr-promo-close-icon {
        display: grid;
        width: 32px;
        height: 32px;
        place-items: center;
        border: 0;
        border-radius: 50%;
        color: #828995;
        background: rgba(236,239,242,.88);
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
      }

      .qr-promo-hero-icon {
        position: relative;
        display: grid;
        width: 68px;
        height: 68px;
        margin: 0 auto 11px;
        place-items: center;
        border-radius: 22px;
        color: #fff;
        background: linear-gradient(145deg, #ff7059, #ffad76);
        box-shadow:
          0 13px 26px rgba(255,112,89,.26),
          inset 0 1px 0 rgba(255,255,255,.35);
        font-size: 29px;
      }
      .qr-promo-hero-icon::after {
        content: "";
        position: absolute;
        top: 7px;
        right: 7px;
        width: 9px;
        height: 9px;
        border: 2px solid #fff;
        border-radius: 50%;
        background: #38ca79;
      }

      .qr-promo-dialog h2 {
        position: relative;
        margin: 0;
        color: #29313d;
        font-size: 22px;
        font-weight: 900;
        line-height: 1.4;
        letter-spacing: -.2px;
      }
      .qr-promo-subtitle {
        margin: 7px 0 0;
        color: #8b929d;
        font-size: 12px;
        line-height: 1.65;
      }

      .qr-promo-benefits {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 7px;
        margin: 16px 0 0;
      }
      .qr-promo-benefit {
        display: grid;
        min-height: 48px;
        place-items: center;
        border: 1px solid rgba(98,114,133,.10);
        border-radius: 12px;
        padding: 6px 4px;
        color: #56616f;
        background: rgba(247,249,250,.90);
        font-size: 10px;
        font-weight: 700;
        line-height: 1.35;
      }
      .qr-promo-benefit span {
        display: block;
        margin-bottom: 2px;
        font-size: 15px;
      }

      .qr-promo-qr-card {
        position: relative;
        margin-top: 16px;
        border: 1px solid rgba(255,120,91,.15);
        border-radius: 22px;
        padding: 15px 14px 13px;
        background:
          linear-gradient(145deg, rgba(255,249,246,.98), rgba(248,252,252,.98));
        box-shadow:
          inset 0 1px 0 #fff,
          0 10px 25px rgba(57,68,83,.08);
      }
      .qr-promo-qr-card::before,
      .qr-promo-qr-card::after {
        content: "";
        position: absolute;
        width: 20px;
        height: 20px;
        border-color: #ff856c;
        pointer-events: none;
      }
      .qr-promo-qr-card::before {
        top: 11px;
        left: 11px;
        border-top: 3px solid #ff856c;
        border-left: 3px solid #ff856c;
        border-radius: 5px 0 0;
      }
      .qr-promo-qr-card::after {
        right: 11px;
        bottom: 11px;
        border-right: 3px solid #62c7c7;
        border-bottom: 3px solid #62c7c7;
        border-radius: 0 0 5px;
      }

      .qr-promo-group {
        margin: 0 0 10px;
        color: #343c49;
        font-size: 14px;
        font-weight: 900;
        line-height: 1.45;
      }
      .qr-promo-large {
        display: block;
        width: min(100%, 232px);
        aspect-ratio: 1;
        margin: 0 auto;
        border: 10px solid #fff;
        border-radius: 18px;
        object-fit: contain;
        background: #fff;
        box-shadow: 0 8px 22px rgba(48,60,76,.12);
      }
      .qr-promo-scan-tip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 11px;
        border-radius: 999px;
        padding: 5px 10px;
        color: #ff7259;
        background: #fff1eb;
        font-size: 10px;
        font-weight: 800;
      }

      .qr-promo-description {
        margin: 13px 2px 0;
        color: #a0a6af;
        font-size: 10px;
        line-height: 1.7;
      }

      .qr-promo-close {
        width: 100%;
        min-height: 48px;
        margin-top: 17px;
        border: 0;
        border-radius: 14px;
        color: #fff;
        background: linear-gradient(135deg, #ff7059, #ff9668);
        box-shadow: 0 10px 22px rgba(255,112,89,.22);
        font-size: 15px;
        font-weight: 900;
        cursor: pointer;
        transition: transform .16s ease, box-shadow .16s ease;
      }
      .qr-promo-close:hover {
        box-shadow: 0 13px 26px rgba(255,112,89,.28);
      }
      .qr-promo-close:active {
        transform: scale(.985);
      }

      body.qr-promo-open {
        overflow: hidden;
      }

      @keyframes qrPromoFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes qrPromoPopIn {
        from {
          opacity: 0;
          transform: translateY(14px) scale(.97);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @media (max-width: 480px) {
        .qr-promo-floating {
          right: auto;
          bottom: 78px;
          min-width: 154px;
          max-width: calc(100vw - 28px);
        }
        .qr-promo-overlay {
          align-items: end;
          padding: 0;
        }
        .qr-promo-dialog {
          width: 100%;
          max-height: 94vh;
          border-radius: 25px 25px 0 0;
          padding-bottom: calc(17px + env(safe-area-inset-bottom));
        }
        .qr-promo-benefits {
          gap: 6px;
        }
        .qr-promo-large {
          width: min(100%, 220px);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .qr-promo-overlay,
        .qr-promo-dialog {
          animation: none;
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
    overlay.querySelector(".qr-promo-close-icon")?.focus();
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

    const topbar = document.createElement("div");
    topbar.className = "qr-promo-topbar";

    const topBadge = document.createElement("span");
    topBadge.className = "qr-promo-top-badge";
    topBadge.textContent = "群聊入口正常";

    const iconCloseButton = document.createElement("button");
    iconCloseButton.className = "qr-promo-close-icon";
    iconCloseButton.type = "button";
    iconCloseButton.setAttribute("aria-label", "关闭弹窗");
    iconCloseButton.textContent = "×";

    topbar.append(topBadge, iconCloseButton);

    const heroIcon = document.createElement("div");
    heroIcon.className = "qr-promo-hero-icon";
    heroIcon.setAttribute("aria-hidden", "true");
    heroIcon.textContent = "👥";

    const title = document.createElement("h2");
    title.textContent = values.title;

    const subtitle = document.createElement("p");
    subtitle.className = "qr-promo-subtitle";
    subtitle.textContent = "加入群聊，及时查看资源更新与失效提醒";

    const benefits = document.createElement("div");
    benefits.className = "qr-promo-benefits";
    benefits.innerHTML = `
      <div class="qr-promo-benefit"><span>🔔</span>更新提醒</div>
      <div class="qr-promo-benefit"><span>🛡️</span>防止失联</div>
      <div class="qr-promo-benefit"><span>💬</span>失效反馈</div>
    `;

    const qrCard = document.createElement("div");
    qrCard.className = "qr-promo-qr-card";

    const groupName = document.createElement("p");
    groupName.className = "qr-promo-group";
    groupName.textContent = values.groupName;

    const largeImage = document.createElement("img");
    largeImage.className = "qr-promo-large";
    largeImage.src = values.image;
    largeImage.alt = "群二维码";

    const scanTip = document.createElement("div");
    scanTip.className = "qr-promo-scan-tip";
    scanTip.textContent = "📱 长按识别或截图扫码";

    qrCard.append(groupName, largeImage, scanTip);

    const description = document.createElement("p");
    description.className = "qr-promo-description";
    description.textContent = values.description;

    const closeButton = document.createElement("button");
    closeButton.className = "qr-promo-close";
    closeButton.type = "button";
    closeButton.textContent = "我知道了";

    dialog.append(
      topbar,
      heroIcon,
      title,
      subtitle,
      benefits,
      qrCard,
      description,
      closeButton
    );

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    closeButton.addEventListener("click", closeModal);
    iconCloseButton.addEventListener("click", closeModal);

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
