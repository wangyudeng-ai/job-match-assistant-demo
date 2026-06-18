# GitHub Demo 发布前检查

用于把当前项目作为 GitHub demo 上传前做最后确认。建议先上传 private repo，清理完成后再考虑 public。

## 必查项

- [ ] `.env` 没有被 Git 跟踪。
- [ ] `node_modules/` 没有被 Git 跟踪。
- [ ] `.DS_Store` 没有被 Git 跟踪。
- [ ] 没有真实 API Key、模型服务 token、私有 Base URL 或代理配置。
- [ ] 没有真实简历文件、简历原文、结构化简历 JSON 或联系方式。
- [ ] 没有真实 Boss 导出样例，包括 `boss-job-*.json`、原始 `window._jobInfo`、职位 URL、职位 ID、招聘者或公司可识别信息。
- [ ] 没有浏览器本地存储导出、分析历史、截图、录屏或调试日志。
- [ ] README 中没有承诺未完成能力，例如 OCR、跨网站支持、云端部署、Chrome Web Store 上架。
- [ ] 如果仓库要 public，已确认 Git 提交作者邮箱是否可以公开；否则使用 GitHub noreply 邮箱或新建干净 demo 仓库。
- [ ] 如果希望别人复用代码，已补充明确 LICENSE；如果不授权复用，README 已说明当前未提供开源许可证。

## 建议命令

```sh
git status --short --untracked-files=all
git status --short --ignored
git ls-files .env .DS_Store node_modules src/.DS_Store
git check-ignore -v .env .DS_Store node_modules/ src/.DS_Store
npm test
```

## 敏感词检查建议

发布前可以针对 tracked 文件搜索：

```sh
git grep -n -E "OPENAI_API_KEY|sk-[A-Za-z0-9]{8,}|Bearer|BEGIN .*PRIVATE KEY"
git grep -n "手机号\|邮箱\|简历原文\|resumeRawText"
git grep -n "boss-job-\|window._jobInfo\|encryptId\|job_id"
```

如果需要公开仓库，建议把真实职位样例保存在本地或 private repo 中；公开仓库只放脱敏 mock 数据。
