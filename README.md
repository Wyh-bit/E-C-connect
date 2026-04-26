# CloudSync Bookmarks

这是一个支持 Edge 和 Chrome 双向同步的收藏夹插件。

## 功能特点
- **GitHub 私有仓库同步**：无需自建服务器，数据完全私密。
- **Gzip 压缩**：支持超大规模书签同步，节省流量且避免 GitHub API 拦截。
- **智能合并**：自动合并同名文件夹，去重相同 URL 的书签。
- **实时同步**：书签发生变动（增、删、改、移）时自动触发同步。
- **删除同步**：在一端删除书签，另一端也会同步删除。

## 目录结构
- `/extension`: 浏览器插件源码（支持 Manifest V3）。

## 部署指南

### 1. 插件端部署
1. 下载本项目源码到本地。
2. 打开 Chrome 或 Edge 浏览器的“扩展程序”页面 (`chrome://extensions` 或 `edge://extensions`)。
3. 开启“开发者模式”。
4. 点击“加载解压的扩展程序”，选择 `/extension` 目录。

### 2. GitHub 配置 (推荐方式)
这种模式下，GitHub 充当了你的“云服务器”。
1. **创建私有仓库**：
   - 登录 GitHub，创建一个新的 Repository（例如命名为 `my-bookmarks`）。
   - **务必设置为 Private (私有)**，以保护你的书签隐私。
2. **生成访问令牌 (Token)**：
   - 进入 GitHub [Personal Access Tokens](https://github.com/settings/tokens) 页面。
   - 点击 "Generate new token (classic)"。
   - **Note** 填写 `CloudSync`，**Expiration** 建议选 `No expiration`。
   - **Select scopes**：勾选 `repo` (Full control of private repositories)。
   - 点击生成并**复制保存这个 Token**。
3. **配置插件**：
   - 点击插件图标 -> Settings。
   - 填入生成的 Token、你的 GitHub 用户名 (Owner) 和 仓库名 (Repo)。
   - 点击 **Save Configuration**。

## 注意事项
- 首次同步建议先点击插件弹出框的“Sync Now”进行全量合并。
- 插件会自动在本地存储一个 `snapshot` 用于追踪删除操作。
