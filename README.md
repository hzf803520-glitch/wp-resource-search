# 网盘资源搜索：前台 + 内容管理后台

这是一个不依赖第三方框架的完整可运行版本。后台可以修改前台文案、主题色、分类、网盘来源、资源信息、海报图片和资源链接，保存后前台立即读取新配置。

## 直接运行

需要 Node.js 20 或更高版本。

```bash
npm start
```

打开：

- 前台：`http://localhost:8080`
- 后台：`http://localhost:8080/admin`

默认后台账号：

- 账号：`admin`
- 密码：`admin123`

## 正式上线前修改密码

macOS / Linux：

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD='请换成高强度密码' npm start
```

Windows PowerShell：

```powershell
$env:ADMIN_USERNAME="admin"
$env:ADMIN_PASSWORD="请换成高强度密码"
npm start
```

## 后台可管理内容

- 浏览器标题、LOGO文字、品牌名称
- 搜索区主副标题、提示语和按钮
- 搜索结果、空结果、三个榜单和页脚文案
- 资源弹窗内的全部提示文案
- 网站主色、辅助色和页面背景色
- 分类名称与显示顺序
- 网盘来源名称和默认地址
- 每个资源的完整标题、海报短标题、分类、更新说明、热度和评分
- 每个资源的显示状态、网盘链接和海报图片
- 新增、复制、排序和删除资源

后台上传图片支持 PNG、JPG、WEBP，单张最大 5MB。

## 数据位置

- 当前配置：`data/config.json`
- 上一次配置备份：`data/config.backup.json`
- 后台上传图片：`uploads/`

部署时需要持久保存 `data/` 和 `uploads/` 两个目录，否则重新创建容器后修改内容会丢失。

## Docker 运行

```bash
docker build -t wp-resource-search .
docker run -d \
  -p 8080:8080 \
  -e ADMIN_PASSWORD='请换成高强度密码' \
  -v "$PWD/data:/app/data" \
  -v "$PWD/uploads:/app/uploads" \
  --name wp-resource-search \
  wp-resource-search
```

当前资源内容和地址是演示数据。请仅发布你拥有授权的内容，并将演示链接替换为自己的合法资源地址。

## 免费部署到 Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/hzf803520-glitch/wp-resource-search)

项目已经包含 `render.yaml`，可通过 Render Blueprint 自动创建免费 Web Service：

1. 点击上面的 **Deploy to Render**。
2. 登录 Render，并允许读取此 GitHub 仓库。
3. 在 `ADMIN_PASSWORD` 中填写你的后台密码。
4. 点击创建 Blueprint，等待部署完成。
5. Render 会提供 `https://你的服务名.onrender.com` 地址；后台地址是在结尾加 `/admin`。

此配置使用新加坡区域的免费实例。Render 免费 Web Service 会在闲置时休眠，首次打开可能需要等待几十秒；免费实例不能挂载持久磁盘，因此重新部署或实例重启后，后台修改和新上传图片可能恢复为仓库里的初始内容。需要长期保存时可升级为付费实例并挂载磁盘。
