用于计算美国、英国、德国、加拿大四个国家的FBA仓非FBA仓以及空运/海运的费用。

## 本地运行

双击 `启动本地网站.bat`，或在此目录运行 `node local-server.mjs`，然后打开 `http://127.0.0.1:4177/`。

## 托管 API 模式

部署 `backend/worker.mjs` 时，把服务商密钥设置为 Worker Secret `PROVIDER_API_KEY`，把模型名设置为变量 `PROVIDER_MODEL`。网页会通过 `/config` 自动检测托管模式，不再要求用户填写或发送 API Key。不要把真实密钥写入 `index.html`、配置文件或 Git 仓库。

当前 Worker 仍固定转发到 `https://sub.geekper.com`；部署前需要确认托管平台的出口允许访问该服务商。`ALLOWED_ORIGIN` 应设置为实际网页来源。
