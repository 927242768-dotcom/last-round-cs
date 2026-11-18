# LAST ROUND

CS 个人作品站，包含动漫角色追视、实战回放、装备互动和独立作品管理后台。

公开网站：<https://927242768-dotcom.github.io/>  
作品后台：<https://927242768-dotcom.github.io/admin/>

当前公开版本使用 GitHub Pages，后台直接把作品保存到作者自己的 GitHub 仓库。登录时使用仅授权 `927242768-dotcom.github.io` 仓库、具备 Contents 读写权限的细粒度令牌；令牌仅保留在当前页面内存，退出或刷新后清除。管理页包含创建说明。保存内容后由 GitHub 自动重新发布，单个素材上传上限为 25 MiB；也可填写视频直链。草稿不在前台展示，但公开仓库中的文件仍是公开内容。

Pages 发布文件生成命令：`node scripts/build-pages.mjs .local/pages-source`。已有发布工作树应先拉取仓库最新内容，避免覆盖后台保存的作品。

## 运行

使用 Node.js 24。配置环境变量后运行 `npm start`：

- `ADMIN_PASSWORD`：后台登录密码。
- `ADMIN_SESSION_SECRET`：至少 32 字符的随机签名密钥。
- `PUBLIC_URL`：站点完整 HTTPS 地址。
- `DATA_DIR`：数据库与上传文件的持久目录，容器中设为 `/data`。
- `PORT`：HTTP 监听端口，默认 `3000`。

后台地址为 `/admin`。数据库和上传文件保存在持久目录中，部署时须挂载数据卷。密码和密钥只通过托管平台的环境变量设置。

## 部署

项目包含 Dockerfile，可部署到支持 Node.js 24 与持久数据卷的容器平台。静态资源与两段实战素材随应用发布，管理后台可继续新增、编辑和上传作品。

人物与游戏素材属于站点作者提供的个人作品内容，仓库公开不代表授权他人使用这些素材。
