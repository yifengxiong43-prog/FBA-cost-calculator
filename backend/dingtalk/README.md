# 钉钉机器人服务

这是一个独立的 Node.js 服务。GitHub Pages 只负责网页，钉钉 Stream 机器人和费用 API 必须运行在 Node 服务器、Cloud Run、Render、Fly.io 或其他能长期运行 Node 进程的平台。

## 本地运行

需要 Node.js 18.17 或更高版本：

```powershell
npm install
$env:DINGTALK_CLIENT_ID="你的 AppKey"
$env:DINGTALK_CLIENT_SECRET="你的 AppSecret"
$env:PROVIDER_API_ENDPOINT="https://你的 OpenAI 兼容服务/v1"
$env:PROVIDER_API_KEY="你的模型密钥"
$env:PROVIDER_MODEL="gpt-5.5"
npm start
```

也可以复制 `.env.example` 为 `.env` 后，由部署平台注入这些环境变量。服务不会读取或提交 `.env`，也不会把密钥发到网页。

## 钉钉后台设置

在钉钉开发者后台创建企业内部应用：

1. 开启机器人能力，消息接收模式选择 **Stream 模式**。
2. 将应用加入目标群并授权机器人接收群消息、发送消息。
3. 把 ClientID/AppKey 放入 `DINGTALK_CLIENT_ID`，ClientSecret/AppSecret 放入 `DINGTALK_CLIENT_SECRET`。
4. 启动服务后，机器人会通过 Stream 长连接接收消息，不需要把 AppSecret 放进网页。

群里发送包含尺寸、重量、售价和 FBA 配送日期的文字。缺少字段时机器人会追问；字段完整时会返回美国、德国、英国、加拿大的 FBA、空运、海运和可用的非 FBA 尾程结果。没有提供费率的项目会明确显示“待补充”。英国和加拿大不显示非 FBA 尾程行，因为当前资料没有这两国规则。

## API

`GET /health` 返回服务状态。

`POST /api/calculate` 接受以下 JSON（尺寸单位 mm、重量 g、售价 USD）：

```json
{
  "productName": "36色丙烯马克笔",
  "length": 300,
  "width": 200,
  "height": 50,
  "weight": 800,
  "price": 19.99,
  "feeDate": "2027-02-10"
}
```

如果设置了 `CALCULATE_API_TOKEN`，请求必须带 `Authorization: Bearer <token>`。接口复用网页中的 FBA、海运和非 FBA 计算模块；空运、德国/英国 FBA 等尚未有完整费率的项目返回 `missing_rate`。

## 部署提示

选择能运行 Node 18 的服务，执行 `npm install` 和 `npm start`，并将端口绑定到平台提供的 `PORT`。不要把 `.env`、AppSecret 或模型 Key 提交到 GitHub。部署后先访问 `/health`，再把机器人加入测试群发送一条完整参数消息。
