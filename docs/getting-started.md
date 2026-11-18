# 本地开发

[文档首页](README.md) · [部署与备份](deployment.md)

## 环境

- Node.js **24.x**，包含 npm。
- Git，用于拉取源码和同步发布仓库。
- Docker 为可选项，只在容器部署时使用。

运行时使用 Node 内置的 HTTP、SQLite、文件系统和 Web Crypto 模块，不依赖前端框架或额外数据库服务。

## 获取与检查

```bash
git clone https://github.com/927242768-dotcom/last-round-cs.git
cd last-round-cs
npm run check
```

`check` 验证 JavaScript 语法、必要文件和仓库内文档链接，不会启动服务或发布网站。

## 本地配置

首次启动前复制配置示例：

```powershell
Copy-Item .env.example .env
```

macOS / Linux 可使用 `cp .env.example .env`。填写 `.env` 中的 `ADMIN_PASSWORD` 和 `ADMIN_SESSION_SECRET`，不要将真实配置提交到 Git。

生成会话密钥：

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

| 变量 | 用途 | 本地配置 |
| --- | --- | --- |
| `ADMIN_PASSWORD` | Node 后台管理密码 | 自行设置，不留空 |
| `ADMIN_SESSION_SECRET` | 登录会话签名 | 随机值，至少 32 字符 |
| `PUBLIC_URL` | 站点对外来源，用于写操作校验 | `http://127.0.0.1:3000` |
| `PORT` | HTTP 端口 | `3000` |
| `DATA_DIR` | SQLite 与上传文件目录 | `./.local/data` |

更换端口时，同时修改 `PUBLIC_URL` 的端口。正式部署使用实际 HTTPS 地址和持久目录。

## 启动

```bash
npm run dev
```

打开 `http://127.0.0.1:3000`，后台为 `/admin`。开发命令读取 `.env` 并监听服务端文件变更。

需要关闭监听时使用 `npm run start:local`。托管平台已经注入环境变量时使用 `npm start`。

## 生成 Pages 文件

```bash
npm run build
```

产物位于 `.local/pages-build/`。构建不会启动网站，也不会推送到 GitHub。

指定输出目录：

```bash
npm run build:pages -- .local/custom-build
```

向已有发布工作树构建之前，必须先同步并确认其中的作品数据，具体流程见[部署与备份](deployment.md)。

## 命令速查

| 命令 | 用途 |
| --- | --- |
| `npm run check` | 检查脚本语法、必要文件与文档链接 |
| `npm run dev` | 读取 `.env`，启动开发服务并监听变更 |
| `npm run start:local` | 读取 `.env`，启动本地服务 |
| `npm start` | 使用当前进程环境变量启动服务 |
| `npm run build` | 生成独立的 Pages 预览产物 |
| `npm run build:pages -- <目录>` | 向指定目录生成 Pages 文件 |

Node 模式的数据位于 `DATA_DIR`；Pages 模式的作品保存在发布仓库，两份数据不会自动同步。
