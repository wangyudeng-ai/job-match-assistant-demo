const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildAiMatchMessages,
  parseAiMatchResponse,
  normalizeChatCompletionsUrl
} = require("../src/shared/ai-match.js");

test("buildAiMatchMessages includes resume, target role, and job post", () => {
  const messages = buildAiMatchMessages({
    resumeRawText: "3 年 AI 产品经验，负责需求分析和数据分析。",
    targetRole: "AI 产品经理",
    jobPost: {
      title: "AI 产品经理",
      company: "测试公司",
      salary: "20-30K",
      experienceRequirement: "3-5年",
      educationRequirement: "本科",
      skills: ["需求分析", "数据分析"],
      description: "负责 AI 产品规划、需求分析、跨部门推进。"
    }
  });

  const payload = messages.map((message) => message.content).join("\n");
  assert.match(payload, /AI 产品经理/);
  assert.match(payload, /3 年 AI 产品经验/);
  assert.match(payload, /负责 AI 产品规划/);
});

test("buildAiMatchMessages includes headhunter company fields", () => {
  const messages = buildAiMatchMessages({
    resumeRawText: "3 年 AI 产品经验。",
    targetRole: "AI 产品经理",
    jobPost: {
      title: "AI 产品经理",
      company: "示例教育科技公司",
      delegatedCompany: "示例教育科技公司",
      recruiterCompany: "示例人才咨询",
      isHeadhunter: true,
      salary: "20-40K",
      description: "负责 AI 教育产品规划。"
    }
  });

  const payload = messages.map((message) => message.content).join("\n");
  assert.match(payload, /示例教育科技公司/);
  assert.match(payload, /示例人才咨询/);
  assert.match(payload, /isHeadhunter/);
});

test("parseAiMatchResponse extracts and normalizes JSON from markdown", () => {
  const result = parseAiMatchResponse(`\`\`\`json
{
  "score": 82,
  "level": "高",
  "scoreBreakdown": [
    {"name": "岗位方向", "score": 27, "reason": "目标岗位一致"}
  ],
  "matchedPoints": [
    {"text": "简历中有 AI 产品经验，JD 要求 AI 产品规划", "evidence": "简历：3 年 AI 产品经验；JD：AI 产品规划"}
  ],
  "risks": [],
  "resumeHighlights": ["可强调 AI 产品经验"],
  "communicationTips": ["追问团队 AI 产品规划边界"],
  "suggestion": "建议投递"
}
\`\`\``);

  assert.equal(result.score, 82);
  assert.equal(result.level, "高");
  assert.equal(result.scoreBreakdown[0].name, "岗位方向");
  assert.equal(result.matchedPoints[0].evidence, "简历：3 年 AI 产品经验；JD：AI 产品规划");
  assert.deepEqual(result.risks, []);
  assert.deepEqual(result.communicationTips, ["追问团队 AI 产品规划边界"]);
});

test("normalizeChatCompletionsUrl accepts provider base urls and full endpoints", () => {
  assert.equal(
    normalizeChatCompletionsUrl("https://api.deepseek.com"),
    "https://api.deepseek.com/chat/completions"
  );
  assert.equal(
    normalizeChatCompletionsUrl("https://api.openai.com"),
    "https://api.openai.com/v1/chat/completions"
  );
  assert.equal(
    normalizeChatCompletionsUrl("https://api.deepseek.com/chat/completions"),
    "https://api.deepseek.com/chat/completions"
  );
});
