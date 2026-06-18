const assert = require("node:assert/strict");
const test = require("node:test");

const {
  normalizeBossJobInfo,
  mergeStructuredJobInfo,
  cleanBossDescriptionText,
  cleanBossTagText,
  extractHeadhunterCompanyInfo,
  isLikelyBossDescriptionText
} = require("../src/shared/job-info.js");

test("normalizeBossJobInfo maps list-page camelCase fields", () => {
  const result = normalizeBossJobInfo({
    encryptId: "sample-list-job-001",
    jobName: "AI 产品经理（数据知识 / 数据语义层方向）",
    salaryDesc: "25-50K·15薪",
    experienceName: "1-3年",
    degreeName: "本科",
    postDescription: "职位描述\n负责数据知识与语义层产品。",
    company: "示例科技",
    proxyJob: 0,
    proxyType: 0
  });

  assert.equal(result.jobId, "sample-list-job-001");
  assert.equal(result.title, "AI 产品经理（数据知识 / 数据语义层方向）");
  assert.equal(result.company, "示例科技");
  assert.equal(result.salary, "25-50K·15薪");
  assert.equal(result.experienceRequirement, "1-3年");
  assert.equal(result.educationRequirement, "本科");
  assert.equal(result.description, "职位描述\n负责数据知识与语义层产品。");
  assert.equal(result.isHeadhunter, false);
});

test("normalizeBossJobInfo maps detail-page snake_case fields", () => {
  const result = normalizeBossJobInfo({
    job_id: "sample-detail-job-001",
    job_name: "ai发布产品经理",
    job_salary: "30-60K·16薪",
    company: "示例内容平台公司",
    position: "110110"
  });

  assert.equal(result.jobId, "sample-detail-job-001");
  assert.equal(result.title, "ai发布产品经理");
  assert.equal(result.company, "示例内容平台公司");
  assert.equal(result.salary, "30-60K·16薪");
});

test("mergeStructuredJobInfo prefers structured fields and keeps DOM fallback for missing JD", () => {
  const domJob = {
    source: "boss",
    title: "旧标题",
    company: "示例农业科技",
    salary: "\uE033\uE031-\uE035\uE031K",
    salaryFontFamily: "kanzhun-mix",
    experienceRequirement: "3-5年",
    educationRequirement: "本科",
    description: "职位描述\nDOM 中的完整岗位内容。",
    skills: ["AI产品"],
    capturedAt: "2026-06-08T00:00:00.000Z",
    url: "https://www.zhipin.com/job_detail/test.html"
  };

  const merged = mergeStructuredJobInfo(domJob, {
    job_id: "sample-detail-job-001",
    job_name: "ai发布产品经理",
    job_salary: "30-60K·16薪",
    company: "示例内容平台公司"
  });

  assert.equal(merged.jobId, "sample-detail-job-001");
  assert.equal(merged.title, "ai发布产品经理");
  assert.equal(merged.company, "示例内容平台公司");
  assert.equal(merged.salary, "30-60K·16薪");
  assert.equal(merged.salaryFontFamily, "");
  assert.equal(merged.description, "职位描述\nDOM 中的完整岗位内容。");
  assert.equal(merged.captureSource, "structured+dom");
});

test("cleanBossDescriptionText removes leading noise tags before the real JD", () => {
  const result = cleanBossDescriptionText(`
职位描述
B直聘端产品
K12
来自BOSS直聘教育方向
To B
AI教育
我们需要你：
1. 参与公司K12教育方向的业务规划。
2. 深度洞察学生、教师、学校三端的真实使用场景。
`);

  assert.equal(
    result,
    "职位描述\n我们需要你：\n1. 参与公司K12教育方向的业务规划。\n2. 深度洞察学生、教师、学校三端的真实使用场景。"
  );
});

test("cleanBossDescriptionText handles Boss direct-hire marker and cuts legal company noise", () => {
  const result = cleanBossDescriptionText(`
职位直聘描述
B端产品
K12
教育方向
To B
AI教育
英语
国际化
AI产品
我们需要你：1. 参与公司K12教育方向的业务规划；2. 深度洞察学生、教师、学校三端的真实使用场景。
职位要求我们希望你：1. 具备3年以上教育产品或ToB方向的产品工作经验。
加分项：1. 拥有面向K12阶段的AI教育产品0-1落地经验。
安全提示
严禁用人单位和招聘者用户做出任何损害求职者合法权益的违法违规行为。
工商信息
公司名称示例人才咨询有限公司
法定代表人张某
`);

  assert.equal(
    result,
    "职位描述\n我们需要你：1. 参与公司K12教育方向的业务规划；2. 深度洞察学生、教师、学校三端的真实使用场景。\n职位要求我们希望你：1. 具备3年以上教育产品或ToB方向的产品工作经验。\n加分项：1. 拥有面向K12阶段的AI教育产品0-1落地经验。"
  );
  assert.doesNotMatch(result, /安全提示|工商信息|公司名称|B端产品\nK12/);
});

test("extractHeadhunterCompanyInfo strips legal label from recruiter company", () => {
  const result = extractHeadhunterCompanyInfo({
    company: "公司名称示例人才咨询有限公司",
    description: "职位描述\n我们需要你：\n1. 负责 AI 教育产品规划。",
    tags: []
  });

  assert.equal(result.isHeadhunter, true);
  assert.equal(result.recruiterCompany, "示例人才咨询有限公司");
});

test("isLikelyBossDescriptionText rejects unrelated recommendation job lists", () => {
  const text = `
北京
推荐排序产品
20-40K
ExampleVideo
北京
售后产品经理（工具 / 平台方向）
20-30K·16薪
ExampleCloud
`;

  assert.equal(isLikelyBossDescriptionText(text), false);
});

test("isLikelyBossDescriptionText accepts real JD bodies", () => {
  const text = `
职责：
1. 负责学堂在线AI教育教学相关产品功能及差异化竞争策略的分析和规划。
2. 跟踪AI+教育领域的技术趋势与政策动态。
要求：
1. 本科及以上学历，2-3年以上产品经验。
`;

  assert.equal(isLikelyBossDescriptionText(text), true);
});

test("cleanBossTagText removes Boss source noise while keeping useful tags", () => {
  const rawTags = ["直聘", "来自BOSS直聘教育方向", "B直聘端产品", "K12", "AI教育"];
  const result = rawTags.map(cleanBossTagText).filter(Boolean);

  assert.deepEqual(result, ["教育方向", "B端产品", "K12", "AI教育"]);
});

test("extractHeadhunterCompanyInfo separates entrusted company from recruiter company", () => {
  const result = extractHeadhunterCompanyInfo({
    company: "示例人才咨询",
    description: `
职位描述
代招公司：示例内容平台公司
我们需要你：
1. 负责 AI 教育产品规划。
`,
    tags: ["猎头", "来自BOSS直聘"]
  });

  assert.equal(result.isHeadhunter, true);
  assert.equal(result.recruiterCompany, "示例人才咨询");
  assert.equal(result.delegatedCompany, "示例内容平台公司");
});

test("extractHeadhunterCompanyInfo treats consulting firms as recruiter companies", () => {
  const result = extractHeadhunterCompanyInfo({
    company: "示例人才咨询",
    description: "职位描述\n我们需要你：\n1. 负责 AI 教育产品规划。",
    tags: ["AI教育"]
  });

  assert.equal(result.isHeadhunter, true);
  assert.equal(result.recruiterCompany, "示例人才咨询");
  assert.equal(result.delegatedCompany, "");
});

test("extractHeadhunterCompanyInfo does not treat normal companies as recruiter companies", () => {
  const result = extractHeadhunterCompanyInfo({
    company: "示例科技",
    description: "职位描述\n我们需要你：\n1. 负责 B 端产品规划。",
    tags: ["猎头"],
    isHeadhunter: true
  });

  assert.equal(result.isHeadhunter, true);
  assert.equal(result.recruiterCompany, "");
  assert.equal(result.delegatedCompany, "示例科技");
});

test("mergeStructuredJobInfo keeps DOM delegated company when structured company is stale", () => {
  const merged = mergeStructuredJobInfo({
    source: "boss",
    title: "b端产品经理（大厂外包 + 三餐）",
    company: "示例委托公司",
    recruiterCompany: "",
    delegatedCompany: "示例委托公司",
    salary: "15-25K",
    salaryFontFamily: "",
    experienceRequirement: "1-3年",
    educationRequirement: "本科",
    description: "职位描述\n1、负责内容治理能力的优化与迭代。",
    skills: ["B端产品", "AI产品"],
    isHeadhunter: true,
    capturedAt: "2026-06-08T00:00:00.000Z",
    url: "https://www.zhipin.com/web/geek/jobs"
  }, {
    encryptId: "stale-structured-job",
    jobName: "b端产品经理（大厂外包 + 三餐）",
    salaryDesc: "15-25K",
    company: "示例科技",
    proxyJob: 1
  });

  assert.equal(merged.company, "示例委托公司");
  assert.equal(merged.delegatedCompany, "示例委托公司");
  assert.equal(merged.recruiterCompany, "");
});

test("mergeStructuredJobInfo preserves headhunter company split", () => {
  const merged = mergeStructuredJobInfo({
    source: "boss",
    title: "ai产品经理（教育方向）",
    company: "示例人才咨询",
    recruiterCompany: "示例人才咨询",
    delegatedCompany: "示例教育科技公司",
    salary: "20-40K",
    salaryFontFamily: "",
    experienceRequirement: "3-5年",
    educationRequirement: "本科",
    description: "职位描述\n我们需要你：\n1. 负责教育产品规划。",
    skills: ["AI教育"],
    isHeadhunter: true,
    capturedAt: "2026-06-08T00:00:00.000Z",
    url: "https://www.zhipin.com/job_detail/test.html"
  }, {
    job_id: "sample-detail-job-001",
    job_name: "ai产品经理（教育方向）",
    job_salary: "20-40K",
    company: "示例人才咨询"
  });

  assert.equal(merged.isHeadhunter, true);
  assert.equal(merged.company, "示例教育科技公司");
  assert.equal(merged.recruiterCompany, "示例人才咨询");
  assert.equal(merged.delegatedCompany, "示例教育科技公司");
});
