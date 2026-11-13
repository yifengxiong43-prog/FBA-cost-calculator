# 产品参数智能识别

在“API 设置”填写兼容 OpenAI Chat Completions 的接口地址、API Key，点击“验证连接并获取模型”。
通过 GET `/models` 获取实际模型列表，保留已有的有效选择，否则自动选中返回的首个模型；可点击模型框改选，也可手动填写。
验证仅确认模型列表接口的连通性与权限，不能保证所选模型支持图片或 JSON，实际识别时继续验证输出。
默认地址为 `https://sub.geekper.com/v1`；`/dashboard/v1` 返回管理网页，不能作为 API 地址。网页通过已部署的转发 Worker 访问服务商，避免 GitHub Pages 的跨域限制。
接口地址可以是 `https://服务商/v1` 或完整的 `/chat/completions` 地址。
模型需同时支持图片理解和 JSON 输出；API 服务商需允许本站跨域请求（CORS）。
此 GitHub Pages 页面由浏览器直接访问用户指定的接口。若已部署转发 Worker，浏览器只访问 Worker，再由 Worker 请求固定服务商地址。
地址、模型和用户明确选择保存的 API Key 自动保存在当前浏览器，刷新后恢复；清理网站数据或更换浏览器后需重新设置。Key 不写入代码、不上传到仓库；“清除密钥”会删除它。

输入自然语言、选择 PNG/JPG/WebP 图片（最多 10 MB），或向文字框粘贴截图。
选图仅在本地预览，点击“智能识别”才会把原图和文字一起发送给已配置的 API。
识别后直接填入唯一的产品参数表单，用户检查、补齐后点击“确认参数并计算 FBA”。
本功能没有更改 FBA 费率和费用公式。

## 提取约定

- 缺省尺寸单位 mm，缺省重量单位 g；明确提供 cm/kg 等时，前端按原单位换算。
- 返回数字和单位、识别状态、原文依据；前端校验后才填入。
- 未提供或不能确定的参数为空；识别新产品会清除旧产品的残留字段。
- 售价栏仅接受 USD。零售价与成交价并存且未指定时，提示用户选择。
- 配送日期不得用当前日期、生产日期或其它日期代替。
- 空海运同时显示，没有头程方式选择项。
- 不自动重试、不在错误提示或日志中回显服务商响应或密钥。

## 参考

- [OpenAI Structured Outputs samples](https://github.com/openai/openai-structured-outputs-samples)：参考结构化提取与字段校验的做法，没有复制整个 Next.js 应用。
- [OpenAI Structured Outputs 文档](https://developers.openai.com/api/docs/guides/structured-outputs)：此处使用兼容性较广的 `response_format: json_object`，schema 置于提取提示词中，返回值在本地验证。JSON mode 本身不保证符合 schema。
- [OpenAI 图片输入文档](https://developers.openai.com/api/docs/guides/images-vision)：原始图片通过 image_url data URL 发送，保留表格行列关系供模型读取。

## 验证

运行 `node --test tests/*.test.mjs`。
接口测试使用受控响应，验证图文请求、单位换算、歧义、缺项、错误与取消处理。
真实模型的准确率与 CORS 连通性须在填入实际服务商配置后验证；模拟接口通过不代表真实识别准确率。
