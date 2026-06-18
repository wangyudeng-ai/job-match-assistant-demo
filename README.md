# 求职匹配助手

求职匹配助手是一个本地运行的 Chrome Extension demo，用于在 Boss 直聘职位页捕捉职位信息，并结合用户简历生成匹配分析。

当前状态：V0.1 本地 MVP。它适合代码演示、个人验证和后续产品迭代，不是生产级服务。

## 功能范围

- 在 Boss 直聘职位页注入侧边栏，捕捉当前职位信息。
- 支持上传纯文本简历或文本型 PDF，并在本地提取简历文字。
- 通过本地 Node.js + Express 后端调用 OpenAI-compatible Chat Completions 接口，完成简历结构化和职位匹配分析。
- 在设置页展示并编辑结构化简历 JSON。
- 在侧边栏展示匹配分数、风险点、匹配点、投递建议和最近分析历史。
- 支持导出当前 Boss 职位样例 JSON，用于后续构建回归测试集。

## 技术栈

- Chrome Extension Manifest V3
- 原生 JavaScript / HTML / CSS
- Node.js + Express
- `dotenv`
- `pdfjs-dist`
- Node.js built-in test runner

## 目录结构

```text
manifest.json              Chrome 插件配置
src/content/               Boss 页面侧边栏与职位捕捉
src/options/               插件设置页、简历上传和结构化结果编辑
src/shared/                共享的职位解析、AI schema 和样例导出逻辑
server/                    本地 Express 后端
tests/                     单元测试和后端接口测试
docs/                      产品文档、开发说明和待办
```

## 本地启动

1. 安装依赖：

```sh
npm install
```

2. 复制环境变量示例：

```sh
cp .env.example .env
```

3. 在 `.env` 中填写自己的模型配置：

```sh
OPENAI_API_KEY=replace-with-your-api-key
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com
```

4. 启动本地后端：

```sh
npm run server
```

后端固定监听 `http://localhost:3000`，当前接口包括：

- `POST /api/resume/structure`
- `POST /api/match/analyze`

## 加载 Chrome 插件

1. 打开 Chrome。
2. 访问 `chrome://extensions/`。
3. 打开“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择本仓库所在目录。

## 使用流程

1. 打开插件设置页。
2. 填写目标岗位。
3. 上传 `.txt` 简历或文本型 `.pdf` 简历。
4. 确认本地后端已启动后，点击“结构化并保存简历”。
5. 打开 Boss 直聘职位页，等待侧边栏显示已捕捉当前职位。
6. 点击“AI 分析”。

## 测试

```sh
npm test
```

## 数据与隐私

- `.env` 只保存在本地，不应提交到 GitHub。
- 插件会把目标岗位、简历文本、结构化简历和最近分析历史保存在浏览器本地存储中。
- 简历原文和职位信息会发送到本地后端，再由本地后端调用你配置的模型 API。
- 不要把真实简历、真实联系方式、真实 Boss 导出样例、分析历史、截图或录屏提交到公开仓库。
- 公开 demo 前请先执行 [GitHub Demo 发布前检查](docs/GITHUB_DEMO_CHECKLIST.md)。

## 已知限制

- 当前只适配 Boss 直聘页面。
- Boss 页面结构变化可能导致职位捕捉失效。
- 普通职位捕捉整体可用；猎头职位的委托公司字段仍需要真实样例回归验证。
- 扫描版或图片型 PDF 暂不支持 OCR。
- AI 匹配结果只作为求职判断参考，不能替代人工判断。
- 当前不包含部署、Chrome Web Store 上架、CI/CD 或云端同步能力。

## Demo 边界

本项目不提供自动投递、自动聊天、批量抓取、绕过登录、绕过平台限制或平台数据商业化能力。

## 许可证

本项目当前未提供开源许可证。除非后续补充明确许可证，否则代码版权由作者保留。

本仓库仅作为个人 demo / 参考项目展示；即使仓库公开，也不代表授权他人使用、修改、再分发或商用本项目代码。
