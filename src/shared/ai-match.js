(function (global) {
  const DEFAULT_SCORE_BREAKDOWN = [
    { name: "岗位方向", maxScore: 30 },
    { name: "核心能力", maxScore: 30 },
    { name: "业务经验", maxScore: 20 },
    { name: "风险缺口", maxScore: 20 }
  ];

  function trimText(value, maxLength) {
    const text = String(value || "").trim();
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  }

  function buildAiMatchMessages(input) {
    const jobPost = input.jobPost || {};
    const systemPrompt = [
      "你是一个严谨的求职匹配分析助手。",
      "只能根据用户提供的简历、目标岗位和 JD 分析，禁止编造不存在的经历。",
      "必须返回严格 JSON，不要 Markdown，不要解释 JSON 以外的内容。",
      "分数必须可解释，总分 0-100。"
    ].join("\n");
    const userPrompt = [
      "请分析这份简历与当前职位的匹配度。",
      "",
      "评分维度：",
      DEFAULT_SCORE_BREAKDOWN.map((item) => `- ${item.name}：${item.maxScore} 分`).join("\n"),
      "",
      "返回 JSON schema：",
      JSON.stringify({
        score: 0,
        level: "高/中/低",
        scoreBreakdown: [
          { name: "岗位方向", score: 0, maxScore: 30, reason: "依据简历和JD解释" }
        ],
        matchedPoints: [
          { text: "匹配点", evidence: "简历依据；JD依据" }
        ],
        risks: [
          { text: "风险点", evidence: "简历依据；JD依据" }
        ],
        resumeHighlights: ["建议在沟通或投递中强调的简历亮点"],
        communicationTips: ["和招聘方沟通时可追问或强调的点"],
        suggestion: "建议投递/谨慎投递/不建议投递",
        summary: "一句话总结"
      }, null, 2),
      "",
      "要求：",
      "- scoreBreakdown 必须覆盖岗位方向、核心能力、业务经验、风险缺口四项。",
      "- matchedPoints 和 risks 每条都必须有 evidence。",
      "- evidence 必须明确写出来自简历或 JD 的依据。",
      "- 如果证据不足，要写明证据不足，不要猜测。",
      "",
      `目标岗位：${input.targetRole || ""}`,
      "",
      "基础解析结果：",
      JSON.stringify(input.resumeProfileDraft || {}, null, 2),
      "",
      "当前职位：",
      JSON.stringify({
        title: jobPost.title || "",
        company: jobPost.company || "",
        isHeadhunter: Boolean(jobPost.isHeadhunter),
        delegatedCompany: jobPost.delegatedCompany || "",
        recruiterCompany: jobPost.recruiterCompany || "",
        salary: jobPost.salary || "",
        experienceRequirement: jobPost.experienceRequirement || "",
        educationRequirement: jobPost.educationRequirement || "",
        skills: jobPost.skills || [],
        description: trimText(jobPost.description, 6000)
      }, null, 2),
      "",
      "简历文本：",
      trimText(input.resumeRawText, 8000)
    ].join("\n");

    return [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];
  }

  function extractJsonText(value) {
    const text = String(value || "").trim();
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

  function normalizeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeScore(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(number)));
  }

  function parseAiMatchResponse(value) {
    const parsed = JSON.parse(extractJsonText(value));
    const score = normalizeScore(parsed.score);
    const level = parsed.level || (score >= 75 ? "高" : score >= 55 ? "中" : "低");

    return {
      score,
      level,
      scoreBreakdown: normalizeArray(parsed.scoreBreakdown),
      matchedPoints: normalizeArray(parsed.matchedPoints),
      risks: normalizeArray(parsed.risks),
      resumeHighlights: normalizeArray(parsed.resumeHighlights),
      communicationTips: normalizeArray(parsed.communicationTips),
      suggestion: parsed.suggestion || "",
      summary: parsed.summary || ""
    };
  }

  function normalizeChatCompletionsUrl(value) {
    const rawValue = String(value || "").trim().replace(/\/+$/, "");
    if (!rawValue) {
      return "";
    }

    if (/\/chat\/completions$/i.test(rawValue)) {
      return rawValue;
    }

    if (/api\.deepseek\.com$/i.test(rawValue)) {
      return `${rawValue}/chat/completions`;
    }

    return `${rawValue}/v1/chat/completions`;
  }

  const api = {
    buildAiMatchMessages,
    parseAiMatchResponse,
    normalizeChatCompletionsUrl
  };

  global.JobMatchAi = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
