function trimText(value, maxLength) {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeContact(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, normalizeText(entry)])
  );
}

function normalizeEducationItem(value = {}) {
  return {
    startDate: normalizeText(value.startDate),
    endDate: normalizeText(value.endDate),
    school: normalizeText(value.school || value.name),
    degree: normalizeText(value.degree),
    major: normalizeText(value.major),
    description: normalizeText(value.description)
  };
}

function normalizeWorkItem(value = {}) {
  return {
    startDate: normalizeText(value.startDate),
    endDate: normalizeText(value.endDate),
    company: normalizeText(value.company || value.name),
    role: normalizeText(value.role || value.title),
    description: normalizeText(value.description)
  };
}

function normalizeProjectItem(value = {}) {
  return {
    startDate: normalizeText(value.startDate),
    endDate: normalizeText(value.endDate),
    name: normalizeText(value.name),
    role: normalizeText(value.role),
    description: normalizeText(value.description)
  };
}

function normalizeResumeProfile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("模型返回的简历结构不是 JSON 对象");
  }

  return {
    name: normalizeText(value.name),
    contact: normalizeContact(value.contact),
    location: normalizeText(value.location),
    education: normalizeArray(value.education).map(normalizeEducationItem),
    workExperience: normalizeArray(value.workExperience).map(normalizeWorkItem),
    projects: normalizeArray(value.projects).map(normalizeProjectItem),
    skills: normalizeArray(value.skills).map(normalizeText).filter(Boolean),
    summary: normalizeText(value.summary)
  };
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

function parseResumeStructureResponse(value) {
  return normalizeResumeProfile(JSON.parse(extractJsonText(value)));
}

function normalizeChatCompletionsUrl(value) {
  const rawValue = normalizeText(value).replace(/\/+$/, "");
  if (!rawValue) {
    return "";
  }
  if (/\/chat\/completions$/i.test(rawValue)) {
    return rawValue;
  }
  if (/\/v1$/i.test(rawValue)) {
    return `${rawValue}/chat/completions`;
  }
  return `${rawValue}/v1/chat/completions`;
}

function buildResumeStructureMessages(resumeRawText, retryReason = "") {
  const systemPrompt = [
    "你是一个严谨的简历结构化助手。",
    "只能依据用户提供的简历原文结构化信息，禁止编造不存在的学校、公司、项目、技能或时间。",
    "必须返回严格 JSON，不要 Markdown，不要解释 JSON 以外的内容。",
    "如果原文缺少某个字段，使用空字符串或空数组。"
  ].join("\n");

  const userPrompt = [
    retryReason ? `上一次返回无法解析或不符合 schema：${retryReason}` : "",
    "请把下面的简历原文结构化为固定 JSON schema。",
    "",
    "返回 JSON schema：",
    JSON.stringify({
      name: "",
      contact: {
        email: "",
        phone: "",
        wechat: "",
        links: ""
      },
      location: "",
      education: [
        {
          startDate: "",
          endDate: "",
          school: "",
          degree: "",
          major: "",
          description: ""
        }
      ],
      workExperience: [
        {
          startDate: "",
          endDate: "",
          company: "",
          role: "",
          description: ""
        }
      ],
      projects: [
        {
          startDate: "",
          endDate: "",
          name: "",
          role: "",
          description: ""
        }
      ],
      skills: [],
      summary: ""
    }, null, 2),
    "",
    "要求：",
    "- education、workExperience、projects 必须是数组。",
    "- 每段经历尽量保留起止时间、名称/公司/学校、角色/学历和描述。",
    "- description 用简短中文概括原文依据，不要添加原文没有的信息。",
    "- 只返回 JSON。",
    "",
    "简历原文：",
    trimText(resumeRawText, 12000)
  ].filter(Boolean).join("\n");

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];
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

async function callChatCompletions({ resumeRawText, fetchImpl, env, retryReason = "" }) {
  const { apiKey, model, apiUrl } = readConfig(env);
  const response = await fetchImpl(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: buildResumeStructureMessages(resumeRawText, retryReason),
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

async function structureResume({ resumeRawText, fetchImpl = globalThis.fetch, env = process.env }) {
  const text = normalizeText(resumeRawText);
  if (!text) {
    throw new Error("resumeRawText 不能为空");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("当前 Node.js 环境不支持 fetch");
  }

  let firstError;
  try {
    const content = await callChatCompletions({ resumeRawText: text, fetchImpl, env });
    return parseResumeStructureResponse(content);
  } catch (error) {
    firstError = error;
  }

  const content = await callChatCompletions({
    resumeRawText: text,
    fetchImpl,
    env,
    retryReason: firstError.message
  });
  return parseResumeStructureResponse(content);
}

module.exports = {
  buildResumeStructureMessages,
  normalizeChatCompletionsUrl,
  parseResumeStructureResponse,
  structureResume
};
