用于计算美国、英国、德国、加拿大四个国家的FBA仓非FBA仓以及空运/海运的费用。

## 本地运行

双击 `启动本地网站.bat`，脚本会安装依赖、构建 assistant-ui 聊天组件并启动本地服务；或在此目录依次运行 `npm install`、`npm run build:chat`、`node local-server.mjs`，然后打开 `http://127.0.0.1:4177/`。

聊天助手使用 `@assistant-ui/react`，沿用页面中已保存的 API 地址、模型和 Key。聊天输入和图片识别已经合并：当消息包含明确的尺寸、重量、价格或日期时，识别出的字段会更新下方表单；普通问题继续作为对话回答。没有配置时，聊天区会提示先到“API 设置”验证连接。

智能识别区还支持选择或粘贴 PDF、Word（DOCX）、Excel（XLS/XLSX）、CSV 和 TXT 文件。文件在当前浏览器中先提取为文字或表格内容，再和手写文字、图片一起发送给模型；页面会先展示识别状态，用户确认后才用于计算。单个文件限制为 10 MB，提取文字限制为 24000 字；文件解析失败时不会影响原来的手动填写和图片识别。

## 托管 API 模式

部署 `backend/worker.mjs` 时，把服务商密钥设置为 Worker Secret `PROVIDER_API_KEY`，把模型名设置为变量 `PROVIDER_MODEL`。网页会通过 `/config` 自动检测托管模式，不再要求用户填写或发送 API Key。不要把真实密钥写入 `index.html`、配置文件或 Git 仓库。

当前 Worker 仍固定转发到 `https://sub.geekper.com`；部署前需要确认托管平台的出口允许访问该服务商。`ALLOWED_ORIGIN` 应设置为实际网页来源。

## 线上部署

网站地址：<https://yifengxiong43-prog.github.io/FBA-cost-calculator/>。

线上 API 入口是 `https://art-cost-desk-api.pages.dev`。该 Pages 项目通过服务绑定调用 `art-cost-desk-relay` Worker，密钥继续使用 Worker 已保存的 `PROVIDER_API_KEY`，前端和 Git 仓库均不包含真实密钥。当前服务器默认模型为 `gpt-5.5`。

更新后端：在 `backend` 目录运行 `npx wrangler deploy --keep-vars`。更新 API 入口：在 `backend/gateway` 目录运行 `npx wrangler pages deploy public --project-name art-cost-desk-api --branch main`。

发布前端前运行 `npm run build` 和 `npm test`，将网页、模块及两个构建后的 bundle 一起更新到 GitHub Pages。使用新的浏览器会话验证文字识别、图片识别和聊天，确认无需输入 API Key。
