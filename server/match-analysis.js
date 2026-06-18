const {
  buildAiMatchMessages,
  normalizeChatCompletionsUrl
} = require("../src/shared/ai-match.js");

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeScore(value, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.max(0, Math.min(max, Math.round(number)));
}

function extractJsonText(value) {
  const text = normalizeText(value);
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return text;
}

function normalizePoint(value = {}) {
  return {
    text: normalizeText(value.text),
    evidence: normalizeText(value.evidence)
  };
}

function normalizeBreakdownItem(value = {}) {
  const maxScore = normalizeScore(value.maxScore, 100);
  return {
    name: normalizeText(value.name),
    score: normalizeScore(value.score, maxScore || 100),
    maxScore,
    reason: normalizeText(value.reason)
  };
}

function parseMatchAnalysisResponse(value) {
  const parsed = JSON.parse(extractJsonText(value));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("模型返回的匹配分析不是 JSON 对象");
  }

  const score = normalizeScore(parsed.score);
  const level = normalizeText(parsed.level) || (score >= 75 ? "高" : score >= 55 ? "中" : "低");

  return {
    score,
    level,
    scoreBreakdown: normalizeArray(parsed.scoreBreakdown).map(normalizeBreakdownItem),
    matchedPoints: normalizeArray(parsed.matchedPoints).map(normalizePoint),
    risks: normalizeArray(parsed.risks).map(normalizePoint),
    resumeHighlights: normalizeArray(parsed.resumeHighlights).map(normalizeText).filter(Boolean),
    communicationTips: normalizeArray(parsed.communicationTips).map(normalizeText).filter(Boolean),
    suggestion: normalizeText(parsed.suggestion),
    summary: normalizeText(parsed.summary)
  };
}

function buildMatchAnalysisMessages(input, retryReason = "") {
  const messages = buildAiMatchMessages(input);
  if (!retryReason) {
    return messages;
  }

  return messages.map((message, index) => {
    if (index !== messages.length - 1) {
      return message;
    }
    return {
      ...message,
      content: [
        `上一次返回无法解析或不符合 schema：${retryReason}`,
        "请重新返回严格 JSON，不要 Markdown，不要解释 JSON 以外的内容。",
        "",
        message.content
      ].join("\n")
    };
  });
}

function readConfig(env) {
  const apiKey = normalizeText(env.OPENAI_API_KEY);
  const model = normalizeText(env.OPENAI_MODEL);
  const apiUrl = normalizeChatCompletionsUrl(env.OPENAI_BASE_URL);

  if (!apiKey || !model || !apiUrl) {
    throw new Error("后端缺少 OPENAI_API_KEY、OPENAI_MODEL 或 OPENAI_BASE_URL 配置");
  }

  return { apiKey, model, apiUrl };
}

async function callChatCompletions({ input, fetchImpl, env, retryReason = "" }) {
  const { apiKey, model, apiUrl } = readConfig(env);
  const response = await fetchImpl(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: buildMatchAnalysisMessages(input, retryReason),
      temperature: 0
    })
  });

  if (!response.ok) {
    const detail = typeof response.text === "function" ? await response.text() : "";
    throw new Error(`模型接口请求失败：${response.status}${detail ? ` ${detail}` : ""}`);
  }

  const payload = await response.json();
  return payload && payload.choices && payload.choices[0] && payload.choices[0].message
    ? payload.choices[0].message.content
    : "";
}

async function analyzeMatch({
  resumeRawText,
  resumeProfileDraft = {},
  targetRole = "",
  jobPost = {},
  fetchImpl = globalThis.fetch,
  env = process.env
}) {
  const text = normalizeText(resumeRawText);
  if (!text) {
    throw new Error("resumeRawText 不能为空");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("当前 Node.js 环境不支持 fetch");
  }

  const input = {
    resumeRawText: text,
    resumeProfileDraft,
    targetRole,
    jobPost
  };

  const content = await callChatCompletions({ input, fetchImpl, env });
  try {
    return parseMatchAnalysisResponse(content);
  } catch (error) {
    const retryContent = await callChatCompletions({
      input,
      fetchImpl,
      env,
      retryReason: error.message
    });
    return parseMatchAnalysisResponse(retryContent);
  }
}

module.exports = {
  analyzeMatch,
  buildMatchAnalysisMessages,
  parseMatchAnalysisResponse
};
