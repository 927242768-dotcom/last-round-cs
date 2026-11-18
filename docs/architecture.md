# 项目结构与运行方式

LAST ROUND 是包含角色追视、实战回放、装备互动与作品管理的个人作品站。前端使用原生 HTML、CSS 和 JavaScript；同一套源码支持 GitHub Pages 和 Node.js 两种运行方式。

## 两个仓库的职责

| 仓库 | 保存内容 | 用途 |
| --- | --- | --- |
| [`last-round-cs`](https://github.com/927242768-dotcom/last-round-cs) | 前端源码、Node 服务、构建脚本与维护文档 | 开发和维护 |
| [`927242768-dotcom.github.io`](https://github.com/927242768-dotcom/927242768-dotcom.github.io) | Pages 发布文件、作品记录与上传素材 | 当前公开网站及后台写入目标 |

当前网站为 <https://927242768-dotcom.github.io/>，作品后台为 <https://927242768-dotcom.github.io/admin/>。修改源码仓库不会直接更新这个网站；需要生成发布文件，再更新发布仓库。

## 目录

```text
public/                 前端页面、样式、交互脚本、字体和媒体
hosting/server.mjs      Node HTTP 服务及静态资源入口
hosting/sqlite.mjs      Node 内置 SQLite 适配及自动迁移
hosting/files.mjs       本地上传文件存储
hosting/pages-admin.js  Pages 后台使用的 GitHub 接口适配
server/                 作品接口、验证、认证、媒体处理和初始作品
drizzle/                SQLite 迁移 SQL
scripts/                Pages 构建和仓库检查脚本
docs/                   维护文档
.local/                 本地数据、发布工作树和构建输出，不提交源码仓库
```

## 两种模式

| 项目 | GitHub Pages | Node.js |
| --- | --- | --- |
| 运行环境 | 静态站点 | Node.js 24，使用内置 SQLite，无第三方运行时依赖 |
| 公开作品 | 静态 JSON 文件 `api/works` | `GET /api/works` 查询 SQLite |
| 后台登录 | 发布仓库的 GitHub 访问令牌 | 管理密码及 HMAC 签名会话 |
| 作品数据 | 发布仓库的 `data/works.json` | 数据目录的 `last-round.sqlite` |
| 上传素材 | 发布仓库的 `media/uploads/` | 数据目录的 `uploads/` |
| 单文件上传上限 | 25 MiB | 90 MiB |
| 保存生效 | 提交后等待 Pages 发布 | 服务写入数据库后生效 |

这两种模式使用独立的数据存储，不会自动同步作品或上传素材。Pages 后台的 GitHub 令牌仅存在当前页面内存中；Node 会话有效期为 8 小时，使用 `HttpOnly`、`Secure`、`SameSite=Strict` Cookie。

## 构建与请求流程

Pages 构建复制 `public/`，生成静态作品列表和 `/admin/` 页面，并将后台请求接到 GitHub API。发布版使用 `/media/` 下的内置回放文件；这些转换只发生在构建输出中。

Node 服务直接提供 `public/`，把 `/admin` 和 `/admin/` 映射到后台页面，并处理 `/api/` 请求。启动时自动执行尚未应用的 `drizzle/*.sql`；首次读取作品时写入初始作品，后续删除的作品不会自动恢复。数据库和上传文件应共同保存在持久目录中。

维护步骤见[部署说明](deployment.md)，内容更新见[作品管理说明](content-management.md)。
