# 本地运行与部署

以下命令均在源码仓库根目录执行，需要 Node.js 24。项目没有第三方运行时依赖，启动前无需执行 `npm install`。

## 本地 Node 服务

先复制环境变量示例：

```powershell
Copy-Item .env.example .env
```

编辑 `.env`，填写 `ADMIN_PASSWORD` 和至少 32 字符的随机 `ADMIN_SESSION_SECRET`，然后启动：

```powershell
npm run start:local
```

默认页面为 <http://127.0.0.1:3000/>，后台路径为 `/admin`。需要文件变化后重启服务时，使用 `npm run dev`。这两个本地命令会读取 `.env`；`npm start` 仅使用进程已有的环境变量。

| 环境变量 | 含义 |
| --- | --- |
| `ADMIN_PASSWORD` | 必填，后台管理密码 |
| `ADMIN_SESSION_SECRET` | 必填，至少 32 字符的随机会话签名密钥 |
| `PUBLIC_URL` | 站点来源地址；正式部署填写实际 HTTPS 地址 |
| `PORT` | HTTP 监听端口，默认 `3000` |
| `DATA_DIR` | 数据持久目录；本地默认 `./.local/data`，容器使用 `/data` |

未配置 `PUBLIC_URL` 时，服务优先使用 `RAILWAY_PUBLIC_DOMAIN`，否则使用本机回环地址。后台写操作校验请求来源，正式站点地址应与该配置一致。后台使用 Secure Cookie，正式部署需要 HTTPS。

## Node 容器部署

`Dockerfile` 使用 Node.js 24，直接运行 `hosting/server.mjs`，不需要 Pages 构建步骤。

```powershell
docker build -t last-round .
docker volume create last-round-data
docker run --name last-round -p 3000:3000 --env-file .env -e DATA_DIR=/data -v last-round-data:/data last-round
```

在托管平台配置同样的环境变量，将永久数据卷挂载到 `/data`，并通过平台的 HTTPS 入口访问。部署前将 `PUBLIC_URL` 设为正式地址；平台若指定端口，应将其注入 `PORT`。

备份需要覆盖整个数据目录，包括 SQLite 数据库、可能存在的 WAL 文件及 `uploads/`。最直接的方式是停止服务后复制整个数据卷；不要只备份容器镜像或上传目录。重新部署继续挂载原数据卷即可保留作品。

## GitHub Pages 构建

生成独立预览产物：

```powershell
npm run build
```

输出位于 `.local/pages-build/`。指定其他输出目录时使用：

```powershell
npm run build:pages -- <输出目录>
```

这是静态站点构建，不包含 Node 服务或 SQLite。静态预览需要通过 HTTP 服务打开；后台保存仍指向固定的 GitHub 发布仓库。

## 更新现有 Pages 网站

发布仓库为 `927242768-dotcom/927242768-dotcom.github.io`，后台写入其 `main` 分支。首次准备发布工作树时：

```powershell
git clone https://github.com/927242768-dotcom/927242768-dotcom.github.io.git .local/pages-source
```

每次发布前，确认该工作树位于 `main` 且没有待处理的本地修改，再同步远端最新内容：

```powershell
git -C .local/pages-source status --short
git -C .local/pages-source branch --show-current
git -C .local/pages-source pull --ff-only
npm run build:pages -- .local/pages-source
git -C .local/pages-source diff --stat
git -C .local/pages-source status --short
```

后台可能已向远端新增作品。构建会读取目标目录现有的 `data/works.json` 并生成 `api/works`；该文件缺失或读取失败时会回落到初始作品。因此构建前须确认作品数据有效，并保留 `data/works.json`、`api/works` 和 `media/uploads/`。不要删除发布目录后重建，不要使用硬重置、强制推送或清理命令覆盖后台内容。

检查作品数量、发布状态、上传素材和前端文件差异后，再按正常 Git 流程提交、推送发布仓库。若推送因远端更新被拒绝，先保留本地修改并协调合并，再重新核对作品数据。推送后等待 GitHub Pages 完成发布，并检查首页与 `/admin/`。

`npm run check` 用于执行仓库检查；检查通过不代表网站已经发布。源码检查、Pages 构建和发布仓库推送是独立步骤。
