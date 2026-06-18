const assert = require("node:assert/strict");
const test = require("node:test");

const { buildBossJobSampleExport } = require("../src/shared/job-sample-export.js");

test("buildBossJobSampleExport creates a regression fixture draft from captured job data", () => {
  const result = buildBossJobSampleExport({
    url: "https://www.zhipin.com/web/geek/jobs",
    pageTitle: "AI 产品经理",
    capturedAt: "2026-06-17T09:00:00.000Z",
    rawStructuredJobInfo: {
      encryptId: "normal-001",
      jobName: "AI 产品经理",
      salaryDesc: "25-50K·15薪",
      company: "示例科技"
    },
    domJob: {
      source: "boss",
      title: "AI 产品经理",
      company: "示例科技",
      salary: "25-50K·15薪",
      experienceRequirement: "1-3年",
      educationRequirement: "本科",
      description: "职位描述\n负责 AI 产品。"
    },
    mergedJob: {
      jobId: "normal-001",
      title: "AI 产品经理",
      company: "示例科技",
      salary: "25-50K·15薪",
      experienceRequirement: "1-3年",
      educationRequirement: "本科",
      description: "职位描述\n负责 AI 产品。",
      isHeadhunter: false,
      captureSource: "structured"
    }
  });

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.caseId, "boss-job-20260617090000-normal-001");
  assert.equal(result.source, "boss");
  assert.equal(result.scenario, "normal");
  assert.equal(result.page.url, "https://www.zhipin.com/web/geek/jobs");
  assert.deepEqual(result.input.rawStructuredJobInfo, {
    encryptId: "normal-001",
    jobName: "AI 产品经理",
    salaryDesc: "25-50K·15薪",
    company: "示例科技"
  });
  assert.equal(result.input.domJob.title, "AI 产品经理");
  assert.equal(result.actual.captureSource, "structured");
  assert.deepEqual(result.expected, {
    jobId: "normal-001",
    title: "AI 产品经理",
    company: "示例科技",
    recruiterCompany: "",
    delegatedCompany: "",
    salary: "25-50K·15薪",
    experienceRequirement: "1-3年",
    educationRequirement: "本科",
    description: "职位描述\n负责 AI 产品。",
    isHeadhunter: false
  });
  assert.equal(result.notes, "");
});
