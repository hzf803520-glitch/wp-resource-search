(() => {
  const button = document.querySelector("#deleteAllResourcesButton");
  if (!button) return;

  const showToast = (message, type = "success") => {
    const toast = document.querySelector("#adminToast");
    if (!toast) {
      alert(message);
      return;
    }
    toast.textContent = message;
    toast.className = `admin-toast show${type === "error" ? " error" : ""}`;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toast.className = "admin-toast";
    }, 2600);
  };

  const requestJson = async (url, options = {}) => {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "请求失败");
    return payload;
  };

  button.addEventListener("click", async () => {
    const confirmed = window.confirm(
      "确定删除全部资源吗？\n\n这会清空前台的全部资源文案、海报和网盘链接，但不会删除已经上传的图片文件。"
    );
    if (!confirmed) return;

    const verification = window.prompt("为防止误操作，请输入：删除全部资源");
    if (verification !== "删除全部资源") {
      showToast("确认文字不正确，已取消删除", "error");
      return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "正在删除...";

    try {
      const config = await requestJson("/api/admin/config");
      const resources = Array.isArray(config.resources) ? config.resources : [];
      const count = resources.length;

      if (!count) {
        showToast("当前没有资源需要删除");
        return;
      }

      const nextConfig = structuredClone(config);
      nextConfig.resources = [];
      if (nextConfig.meta && typeof nextConfig.meta === "object") {
        nextConfig.meta.updatedAt = new Date().toISOString();
      }

      await requestJson("/api/admin/config", {
        method: "PUT",
        body: JSON.stringify(nextConfig)
      });

      showToast(`已删除全部 ${count} 条资源`);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      showToast(error.message || "删除失败", "error");
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });
})();
