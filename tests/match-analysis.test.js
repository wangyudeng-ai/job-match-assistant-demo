const assert = require("node:assert/strict");
const test = require("node:test");
const { Readable, Writable } = require("node:stream");

const {
  analyzeMatch,
  parseMatchAnalysisResponse
} = require("../server/match-analysis.js");
const { createApp } = require("../server/app.js");

const env = {
  OPENAI_API_KEY: "test-key",
  OPENAI_MODEL: "test-model",
  OPENAI_BASE_URL: "https://api.example.com"
};

function modelResponse(content) {
  return {
    ok: true,
    async json() {
      return {
        choices: [
          {
            message: { content }
          }
        ]
      };
    }
  };
}

function requestApp(app, { method, url, body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? "" : JSON.stringify(body);
    const req = Readable.from(payload ? [Buffer.from(payload)] : []);
    req.method = method;
    req.url = url;
    req.headers = {
      ...headers
    };
    if (body !== undefined) {
      req.headers["content-type"] = req.headers["content-type"] || "application/json";
      req.headers["content-length"] = Buffer.byteLength(payload).toString();
    }
    req.socket = {};

    const chunks = [];
    const res = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      }
    });
    res.statusCode = 200;
    res.headers = {};
    res.setHeader = (name, value) => {
      res.headers[name.toLowerCase()] = value;
    };
    res.getHeader = (name) => res.headers[name.toLowerCase()];
    res.removeHeader = (name) => {
      delete res.headers[name.toLowerCase()];
    };
    res.writeHead = (statusCode, headers) => {
      res.statusCode = statusCode;
      Object.entries(headers || {}).forEach(([name, value]) => res.setHeader(name, value));
      return res;
    };
    res.end = (chunk) => {
      if (chunk) {
        chunks.push(Buffer.from(chunk));
      }
      resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8")
      });
      return Writable.prototype.end.call(res);
    };

    app.handle(req, res, reject);
  });
}

function validMatchPayload(overrides = {}) {
  return JSON.stringify({
    score: 82.7,
    level: "",
    scoreBreakdown: [
      { name: "岗位方向", score: 29.6, maxScore: 30, reason: "目标岗位一致" },
      { name: "核心能力", score: "25", maxScore: 30, reason: "具备 AI 产品经验" }
    ],
    matchedPoints: [
      { text: "有 AI 产品经验", evidence: "简历：AI 产品；JD：AI 产品规划" }
    ],
    risks: [
      { text: "行业经验证据不足", evidence: "简历未体现教育行业" }
    ],
    resumeHighlights: ["AI 产品经验"],
    communicationTips: ["追问团队规划边界"],
    suggestion: "建议投递",
    summary: "整体匹配度较高",
    ...overrides
  });
}

test("parseMatchAnalysisResponse extracts and normalizes the match result schema", () => {
  const result = parseMatchAnalysisResponse(`
  \`\`\`json
  ${validMatchPayload({
    score: 101,
    level: "",
    matchedPoints: [{ text: "  AI 产品经验  ", evidence: " JD 要求 AI 产品 " }],
    risks: "not-an-array"
  })}
  \`\`\`
  `);

  assert.equal(result.score, 100);
  assert.equal(result.level, "高");
  assert.equal(result.scoreBreakdown[0].score, 30);
  assert.equal(result.scoreBreakdown[1].score, 25);
  assert.deepEqual(result.matchedPoints, [
    { text: "AI 产品经验", evidence: "JD 要求 AI 产品" }
  ]);
  assert.deepEqual(result.risks, []);
  assert.deepEqual(result.resumeHighlights, ["AI 产品经验"]);
  assert.equal(result.summary, "整体匹配度较高");
});

test("analyzeMatch retries once when the first model response is invalid JSON", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return modelResponse(calls === 1 ? "不是 JSON" : validMatchPayload());
  };

  const result = await analyzeMatch({
    resumeRawText: "3 年 AI 产品经验，负责需求分析。",
    resumeProfileDraft: { skills: ["AI 产品"] },
    targetRole: "AI 产品经理",
    jobPost: { title: "AI 产品经理", description: "负责 AI 产品规划。" },
    fetchImpl,
    env
  });

  assert.equal(calls, 2);
  assert.equal(result.score, 83);
  assert.equal(result.suggestion, "建议投递");
});

test("POST /api/match/analyze returns a match result", async () => {
  const fetchImpl = async () => modelResponse(validMatchPayload({ score: 76 }));
  const response = await requestApp(createApp({ fetchImpl, env }), {
    method: "POST",
    url: "/api/match/analyze",
    body: {
      resumeRawText: "3 年 AI 产品经验，负责需求分析。",
      resumeProfileDraft: { skills: ["AI 产品"] },
      targetRole: "AI 产品经理",
      jobPost: { title: "AI 产品经理", description: "负责 AI 产品规划。" }
    }
  });

  assert.equal(response.statusCode, 200);
  const result = JSON.parse(response.body);
  assert.equal(result.score, 76);
  assert.equal(result.level, "高");
  assert.equal(result.summary, "整体匹配度较高");
});

test("CORS preflight allows Boss content-script requests", async () => {
  const response = await requestApp(createApp({ fetchImpl: async () => modelResponse(validMatchPayload()), env }), {
    method: "OPTIONS",
    url: "/api/match/analyze",
    headers: {
      origin: "https://www.zhipin.com",
      "access-control-request-method": "POST",
      "access-control-request-headers": "Content-Type"
    }
  });

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers["access-control-allow-origin"], "https://www.zhipin.com");
  assert.match(response.headers["access-control-allow-methods"], /POST/);
});
