const assert = require("node:assert/strict");
const test = require("node:test");

const {
  parseResumeStructureResponse,
  structureResume
} = require("../server/resume-structure.js");

test("parseResumeStructureResponse normalizes the resume profile schema", () => {
  const result = parseResumeStructureResponse(`
  \`\`\`json
  {
    "name": "示例候选人",
    "contact": { "email": "test@example.com", "phone": "00000000000" },
    "location": "上海",
    "education": [
      { "startDate": "2016.09", "endDate": "2020.06", "school": "测试大学", "degree": "本科", "major": "产品设计", "description": "主修产品相关课程" }
    ],
    "workExperience": [
      { "startDate": "2022.01", "endDate": "至今", "company": "测试公司", "role": "产品经理", "description": "负责 AI 产品规划" }
    ],
    "projects": [
      { "startDate": "2023.01", "endDate": "2023.12", "name": "AI 教育项目", "role": "产品负责人", "description": "完成 0-1 落地" }
    ],
    "skills": ["AI 产品", "需求分析"],
    "summary": "教育 AI / C 端产品经理"
  }
  \`\`\`
  `);

  assert.deepEqual(Object.keys(result), [
    "name",
    "contact",
    "location",
    "education",
    "workExperience",
    "projects",
    "skills",
    "summary"
  ]);
  assert.equal(result.education[0].school, "测试大学");
  assert.equal(result.workExperience[0].role, "产品经理");
  assert.equal(result.projects[0].name, "AI 教育项目");
  assert.deepEqual(result.skills, ["AI 产品", "需求分析"]);
});

test("structureResume retries once when the first model response is invalid JSON", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: calls === 1
                  ? "不是 JSON"
                  : JSON.stringify({
                    name: "示例候选人",
                    contact: {},
                    location: "",
                    education: [],
                    workExperience: [],
                    projects: [],
                    skills: ["AI 产品"],
                    summary: "产品经理"
                  })
              }
            }
          ]
        };
      }
    };
  };

  const result = await structureResume({
    resumeRawText: "示例候选人，产品经理，擅长 AI 产品。",
    fetchImpl,
    env: {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "test-model",
      OPENAI_BASE_URL: "https://api.example.com"
    }
  });

  assert.equal(calls, 2);
  assert.equal(result.name, "示例候选人");
  assert.deepEqual(result.skills, ["AI 产品"]);
});
