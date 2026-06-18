(function () {
  const ROOT_ID = "job-match-assistant-root";
  const MIN_DESCRIPTION_LENGTH = 40;
  const LOCAL_ANALYZE_URL = "http://localhost:3000/api/match/analyze";
  const MAX_ANALYSIS_HISTORY = 20;

  const SELECTORS = {
    title: [
      ".job-name",
      ".job-title",
      ".job-banner .name",
      ".job-primary .name",
      "[class*='job-name']",
      "[class*='job-title']"
    ],
    company: [
      ".company-name",
      ".company-info .name",
      ".job-company .name",
      ".company-title",
      ".sider-company .name",
      ".company-card .name",
      "[class*='company-name']",
      "[class*='company-title']",
      "a[href*='/gongsi/']",
      "a[href*='/brand/']"
    ],
    salary: [
      ".salary",
      ".job-salary",
      ".job-banner .salary",
      ".job-primary .salary",
      "[class*='salary']"
    ],
    description: [
      ".job-detail",
      ".job-detail-section",
      ".job-sec-text",
      ".detail-content",
      ".job-description",
      "[class*='job-detail']",
      "[class*='job-sec-text']",
      "[class*='description']"
    ]
  };

  const state = {
    currentJob: null,
    structuredJobInfo: null,
    manualDescription: "",
    targetRole: "",
    resumeRawText: "",
    resumeProfileDraft: null,
    aiMatchResult: null,
    aiMatchError: "",
    aiMatchLoading: false,
    analysisHistory: [],
    selectedHistoryIndex: null,
    jobDetailsExpanded: false,
    analysisDetailsExpanded: false,
    manualFallbackExpanded: false,
    jobSampleExportMessage: "",
    closed: false
  };

  function normalizeText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeMultiline(value) {
    return (value || "")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function removeCssNoise(value) {
    return value
      .replace(/[.#]?[A-Za-z][A-Za-z0-9_-]{5,}\{[^{}]*(?:display|width|height|overflow|visibility|font)[^{}]*\}/g, " ")
      .replace(/\{[^{}]*(?:display|width|height|overflow|visibility|font)[^{}]*\}/g, " ");
  }

  function startFromDescriptionMarker(value) {
    const markers = ["职位描述", "岗位职责", "工作职责", "工作内容", "任职要求", "岗位要求"];
    const starts = markers
      .map((marker) => value.indexOf(marker))
      .filter((index) => index >= 0);

    if (starts.length === 0) {
      return value;
    }

    return value.slice(Math.min(...starts));
  }

  function cutBeforePageNoise(value) {
    const endMarkers = [
      "查看更多信息",
      "求职工具",
      "热门职位",
      "热门城市",
      "热门企业",
      "附近城市",
      "升级VIP",
      "VIP尊享",
      "去App与BOSS随时沟通",
      "去App与BOSS随时沟通工作地址",
      "工作地址",
      "公司地址",
      "办公地址",
      "点击查看地图",
      "安全提示",
      "工商信息",
      "公司名称",
      "法定代表人",
      "企业类型",
      "经营状态",
      "高级招聘HR",
      "刚刚活跃",
      "今日活跃",
      "本周活跃",
      "猎头顾问",
      "招聘顾问",
      "人事经理",
      "HRBP",
      "在线"
    ];
    const cuts = endMarkers
      .map((marker) => value.indexOf(marker))
      .filter((index) => index >= 0);

    if (cuts.length === 0) {
      return value;
    }

    return value.slice(0, Math.min(...cuts));
  }

  function cleanDescriptionText(value) {
    const cleaned = normalizeMultiline(cutBeforePageNoise(startFromDescriptionMarker(removeCssNoise(value))))
      .replace(/(职位描述|岗位职责|工作职责|工作内容|任职要求|岗位要求)(?![\n:：])/g, "$1\n")
      .replace(/收藏|立即沟通|举报|微信扫码分享|查看地图/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (window.JobMatchJobInfo && typeof window.JobMatchJobInfo.cleanBossDescriptionText === "function") {
      return window.JobMatchJobInfo.cleanBossDescriptionText(cleaned);
    }

    return cleaned;
  }

  function descriptionScore(value) {
    const hasMarker = /职位描述|岗位职责|工作职责|工作内容|任职要求|岗位要求/.test(value);
    const hasHrCard = /刚刚活跃|今日活跃|本周活跃|猎头顾问|招聘顾问|HRBP/.test(value);
    return value.length + (hasMarker ? 5000 : 0) - (hasHrCard ? 3000 : 0);
  }

  function isLikelyDescription(value) {
    if (window.JobMatchJobInfo && typeof window.JobMatchJobInfo.isLikelyBossDescriptionText === "function") {
      return window.JobMatchJobInfo.isLikelyBossDescriptionText(value);
    }

    return /职位描述|岗位职责|工作职责|工作内容|职位要求|任职要求|岗位要求|我们需要你|我们希望你|职责\s*[:：]|要求\s*[:：]|^\s*\d+\s*[、.．]/m.test(value);
  }

  function textWithoutRecruiterCards(node) {
    const clone = node.cloneNode(true);
    const recruiterSelectors = [
      ".recruiter",
      ".boss-info",
      ".job-boss-info",
      ".job-boss-card",
      ".job-recruiter",
      ".detail-recruiter",
      "[class*='recruiter']",
      "[class*='boss-info']",
      "[class*='boss-card']"
    ];

    recruiterSelectors.forEach((selector) => {
      Array.from(clone.querySelectorAll(selector)).forEach((child) => child.remove());
    });

    return clone.textContent || "";
  }

  function isAssistantNode(node) {
    const assistantRoot = document.getElementById(ROOT_ID);
    return Boolean(assistantRoot && assistantRoot.contains(node));
  }

  function queryPageNodes(selector, scope = document) {
    return Array.from(scope.querySelectorAll(selector)).filter((node) => !isAssistantNode(node));
  }

  function nodeFromSelector(selectors, acceptText = () => true, scope = document) {
    for (const selector of selectors) {
      const node = queryPageNodes(selector, scope).find((candidate) => {
        const text = normalizeText(candidate.textContent);
        return text && acceptText(text);
      });
      if (node) {
        return node;
      }
    }
    return null;
  }

  function textFromSelector(selectors, acceptText, scope = document) {
    const node = nodeFromSelector(selectors, acceptText, scope);
    return node ? normalizeText(node.textContent) : "";
  }

  function fontFamilyFromSelector(selectors, scope = document) {
    const node = nodeFromSelector(selectors, undefined, scope);
    if (!node) {
      return "";
    }
    return window.getComputedStyle(node).fontFamily || "";
  }

  function activeJobCard() {
    const selectors = [
      ".job-card-wrapper.active",
      ".job-card-wrapper.selected",
      ".job-card-wrapper.cur",
      ".job-card-wrapper:hover",
      ".job-list-box .active",
      ".job-list-box .selected",
      ".job-list-box .cur",
      "[class*='job-card'][class*='active']",
      "[class*='job-card'][class*='selected']",
      "[class*='job-card'][class*='cur']"
    ];

    return nodeFromSelector(selectors, undefined, document);
  }

  function isHeadhunterCard(card) {
    return Boolean(card && /猎头/.test(normalizeText(card.textContent)));
  }

  function pageTextWithoutAssistant() {
    if (!document.body) {
      return "";
    }

    const clone = document.body.cloneNode(true);
    const assistantRoot = clone.querySelector(`#${ROOT_ID}`);
    if (assistantRoot) {
      assistantRoot.remove();
    }
    return clone.textContent || "";
  }

  function isHeadhunterPage() {
    const pageText = normalizeText(pageTextWithoutAssistant());
    return /猎头|代招公司/.test(pageText);
  }

  function findJobDetailScope(descriptionNode) {
    const scopeSelectors = [
      ".job-detail-box",
      ".job-detail",
      ".job-detail-section",
      ".detail-content",
      ".job-primary",
      "[class*='job-detail']",
      "[class*='detail-content']"
    ];

    for (const selector of scopeSelectors) {
      const scope = descriptionNode.closest(selector);
      if (scope && !isAssistantNode(scope)) {
        return scope;
      }
    }

    return descriptionNode;
  }

  function descriptionFromPage() {
    for (const selector of SELECTORS.description) {
      const nodes = queryPageNodes(selector);
      const candidates = nodes.map((node) => ({
        text: cleanDescriptionText(textWithoutRecruiterCards(node)),
        scope: findJobDetailScope(node)
      })).filter((candidate) => candidate.text.length >= MIN_DESCRIPTION_LENGTH && isLikelyDescription(candidate.text));
      if (candidates.length > 0) {
        return candidates.sort((a, b) => descriptionScore(b.text) - descriptionScore(a.text))[0];
      }
    }

    const pageText = cleanDescriptionText(document.body ? document.body.textContent : "");
    const markerIndex = pageText.search(/职位描述|岗位职责|任职要求|工作内容/);
    if (markerIndex >= 0) {
      return {
        text: pageText.slice(markerIndex, markerIndex + 2000),
        scope: document
      };
    }

    return {
      text: "",
      scope: document
    };
  }

  function extractTags(scope = document) {
    const selectors = [
      ".tag-list span",
      ".job-tags span",
      ".job-keyword-list span",
      "[class*='tag'] span"
    ];
    const tags = new Set();

    selectors.forEach((selector) => {
      queryPageNodes(selector, scope).forEach((node) => {
        const rawText = normalizeText(node.textContent);
        const text = window.JobMatchJobInfo && typeof window.JobMatchJobInfo.cleanBossTagText === "function"
          ? window.JobMatchJobInfo.cleanBossTagText(rawText)
          : rawText;
        if (text && text.length <= 24) {
          tags.add(text);
        }
      });
    });

    return Array.from(tags).slice(0, 12);
  }

  function splitRequirementParts(tags) {
    return tags.flatMap((tag) =>
      tag
        .split(/[\/｜|·,，]/)
        .map((part) => normalizeText(part))
        .filter(Boolean)
    );
  }

  function isExperienceRequirement(value) {
    return /经验|年|应届|在校|不限/.test(value) && !/本科|大专|硕士|博士|学历|高中|中专/.test(value);
  }

  function isEducationRequirement(value) {
    return /本科|大专|硕士|博士|学历|高中|中专/.test(value);
  }

  function extractRequirements(tags) {
    const parts = splitRequirementParts(tags);
    return {
      experienceRequirement: parts.find(isExperienceRequirement) || "",
      educationRequirement: parts.find(isEducationRequirement) || ""
    };
  }

  function extractHeaderFromDescription(description) {
    const firstLine = description
      .split("\n")
      .map((line) => normalizeText(line))
      .find(Boolean) || "";
    const titleMatch = firstLine.match(/^(.+?)(?:\d{1,3}[-~–]\d{1,3}K|\d{1,3}K|薪|北京|上海|广州|深圳|杭州|成都|收藏|职位描述)/);

    return {
      title: titleMatch ? normalizeText(titleMatch[1]) : ""
    };
  }

  function filterSkillTags(tags, requirements) {
    return tags.filter((tag) => {
      const parts = splitRequirementParts([tag]);
      return !parts.some(
        (part) =>
          part === requirements.experienceRequirement ||
          part === requirements.educationRequirement ||
          isExperienceRequirement(part) ||
          isEducationRequirement(part)
      );
    });
  }

  function extractDomJobPost() {
    const descriptionResult = descriptionFromPage();
    const scope = descriptionResult.scope || document;
    const description = descriptionResult.text;
    const descriptionHeader = extractHeaderFromDescription(description);
    const activeCard = activeJobCard();
    const tags = extractTags(scope);
    const requirements = extractRequirements(tags);
    const isValidCompanyName = (value) => !/^(公司|公司信息|企业信息|公司名称|法定代表人|企业类型|经营状态)/.test(value);
    const isHeadhunter = isHeadhunterCard(activeCard) || isHeadhunterPage();
    const detailCompany = textFromSelector(SELECTORS.company, isValidCompanyName, scope);
    const activeCardCompany = textFromSelector(SELECTORS.company, isValidCompanyName, activeCard || document);
    const company = detailCompany || activeCardCompany || textFromSelector(SELECTORS.company, isValidCompanyName);
    const companyForHeadhunter = isHeadhunter && activeCardCompany ? activeCardCompany : company;
    const skills = filterSkillTags(tags, requirements);
    const headhunterInfo = window.JobMatchJobInfo && typeof window.JobMatchJobInfo.extractHeadhunterCompanyInfo === "function"
      ? window.JobMatchJobInfo.extractHeadhunterCompanyInfo({
        company: companyForHeadhunter,
        description,
        tags,
        isHeadhunter
      })
      : { isHeadhunter, recruiterCompany: "", delegatedCompany: isHeadhunter ? companyForHeadhunter : "" };
    const domJobPost = {
      source: "boss",
      title: textFromSelector(SELECTORS.title, undefined, scope) || textFromSelector(SELECTORS.title, undefined, activeCard || document) || descriptionHeader.title || textFromSelector(SELECTORS.title),
      company: headhunterInfo.delegatedCompany || company,
      recruiterCompany: headhunterInfo.recruiterCompany,
      delegatedCompany: headhunterInfo.delegatedCompany,
      salary: textFromSelector(SELECTORS.salary, undefined, scope) || textFromSelector(SELECTORS.salary, undefined, activeCard || document) || textFromSelector(SELECTORS.salary),
      salaryFontFamily: fontFamilyFromSelector(SELECTORS.salary, scope) || fontFamilyFromSelector(SELECTORS.salary, activeCard || document) || fontFamilyFromSelector(SELECTORS.salary),
      city: "",
      experienceRequirement: requirements.experienceRequirement,
      educationRequirement: requirements.educationRequirement,
      description,
      skills,
      isHeadhunter: headhunterInfo.isHeadhunter,
      captureSource: "dom",
      capturedAt: new Date().toISOString(),
      url: location.href
    };

    return domJobPost;
  }

  function extractJobPost() {
    const domJobPost = extractDomJobPost();

    if (window.JobMatchJobInfo && typeof window.JobMatchJobInfo.mergeStructuredJobInfo === "function") {
      return window.JobMatchJobInfo.mergeStructuredJobInfo(domJobPost, state.structuredJobInfo);
    }

    return domJobPost;
  }

  function hasUsableJob(jobPost) {
    return Boolean(
      jobPost &&
        (jobPost.title || jobPost.company) &&
        jobPost.description &&
        jobPost.description.length >= MIN_DESCRIPTION_LENGTH
    );
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderField(label, value, options = {}) {
    if (!value) {
      return "";
    }

    const style = options.fontFamily ? ` style="font-family: ${escapeHtml(options.fontFamily)}"` : "";
    return `
      <div class="jma-field">
        <div class="jma-label">${escapeHtml(label)}</div>
        <div class="jma-value"${style}>${escapeHtml(value)}</div>
      </div>
    `;
  }

  function renderCompactList(items, options = {}) {
    const limit = options.limit || 2;
    const values = Array.isArray(items) ? items.slice(0, limit) : [];
    if (values.length === 0) {
      return `<span class="jma-empty">暂无</span>`;
    }

    const extraCount = items.length - values.length;
    return `
      <div class="jma-compact-list">
        ${values.map((item) => `<div class="jma-compact-item">${escapeHtml(item)}</div>`).join("")}
        ${extraCount > 0 ? `<div class="jma-compact-more">另 ${extraCount} 条已省略</div>` : ""}
      </div>
    `;
  }

  function renderCompactObjectList(items, options = {}) {
    const limit = options.limit || 2;
    const values = Array.isArray(items) ? items.slice(0, limit) : [];
    if (values.length === 0) {
      return `<span class="jma-empty">暂无</span>`;
    }

    const extraCount = items.length - values.length;
    return `
      <div class="jma-compact-list">
        ${values.map((item) => `
          <div class="jma-compact-item">
            ${escapeHtml(item.text || item.reason || "")}
            ${item.evidence ? `<span class="jma-evidence-inline">${escapeHtml(item.evidence)}</span>` : ""}
          </div>
        `).join("")}
        ${extraCount > 0 ? `<div class="jma-compact-more">另 ${extraCount} 条已省略</div>` : ""}
      </div>
    `;
  }

  function renderCompactScoreBreakdown(items) {
    const values = Array.isArray(items) ? items.filter((item) => item && item.name).slice(0, 4) : [];
    if (values.length === 0) {
      return `<span class="jma-empty">暂无</span>`;
    }

    return `
      <div class="jma-score-pills">
        ${values.map((item) => `
          <span class="jma-score-pill">${escapeHtml(item.name || "")} ${escapeHtml(item.score || 0)}/${escapeHtml(item.maxScore || "")}</span>
        `).join("")}
      </div>
    `;
  }

  function scorePercent(score, maxScore) {
    const scoreNumber = Number(score);
    const maxNumber = Number(maxScore) || 100;
    if (!Number.isFinite(scoreNumber) || maxNumber <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(100, Math.round((scoreNumber / maxNumber) * 100)));
  }

  function renderScoreBars(items) {
    const values = Array.isArray(items) ? items.filter((item) => item && item.name).slice(0, 5) : [];
    if (values.length === 0) {
      return "";
    }

    return `
      <div class="jma-score-bars">
        ${values.map((item) => {
          const percent = scorePercent(item.score, item.maxScore);
          return `
            <div class="jma-score-bar-row">
              <div class="jma-score-bar-head">
                <span>${escapeHtml(item.name || "")}</span>
                <strong>${escapeHtml(item.score || 0)}/${escapeHtml(item.maxScore || "")}</strong>
              </div>
              <div class="jma-score-bar">
                <div class="jma-score-bar-fill" style="width: ${percent}%"></div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderMetaChips(items, options = {}) {
    const values = (Array.isArray(items) ? items : []).filter(Boolean).slice(0, options.limit || 6);
    if (values.length === 0) {
      return "";
    }

    return `
      <div class="jma-meta-chips">
        ${values.map((item) => `<span class="jma-meta-chip">${escapeHtml(item)}</span>`).join("")}
      </div>
    `;
  }

  function renderCompactSection(label, content) {
    return `
      <div class="jma-compact-section">
        <div class="jma-label">${escapeHtml(label)}</div>
        ${content}
      </div>
    `;
  }

  function renderBadges(items) {
    if (!items || items.length === 0) {
      return `<span class="jma-empty">暂无明显命中</span>`;
    }

    return `
      <div class="jma-badges">
        ${items.map((item) => `<span class="jma-badge">${escapeHtml(item)}</span>`).join("")}
      </div>
    `;
  }

  function formatAnalysisTime(value) {
    if (!value) {
      return "";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function historyDisplayItems() {
    const history = normalizeAnalysisHistory(state.analysisHistory)
      .map((item, index) => ({ item, index }));
    const favorites = history.filter(({ item }) => item.favorite);
    const recents = history.filter(({ item }) => !item.favorite);
    return [...favorites, ...recents].slice(0, 5);
  }

  function renderHistoryDetail() {
    if (state.selectedHistoryIndex === null || state.selectedHistoryIndex === undefined) {
      return "";
    }

    const index = Number(state.selectedHistoryIndex);
    const item = normalizeAnalysisHistory(state.analysisHistory)[index];
    if (!item) {
      return "";
    }

    const result = item.matchResult || item;
    const title = item.title || "未命名职位";
    const company = item.company ? ` · ${item.company}` : "";
    const time = formatAnalysisTime(item.analyzedAt);
    return `
      <div class="jma-history-detail">
        <div class="jma-history-detail-head">
          <div>
            <div class="jma-label">历史详情</div>
            <div class="jma-history-main">${escapeHtml(title)}${escapeHtml(company)}</div>
            ${time ? `<div class="jma-note">${escapeHtml(time)}</div>` : ""}
          </div>
          <button class="jma-inline-button" data-history-close-detail type="button">收起</button>
        </div>
        <div class="jma-score">${escapeHtml(result.level || item.level || "")}${result.score || result.score === 0 ? ` · ${escapeHtml(result.score)}分` : ""}</div>
        ${result.summary ? `<div class="jma-note">${escapeHtml(result.summary)}</div>` : ""}
        <div class="jma-analysis-compact">
          ${renderCompactSection("匹配点", renderCompactObjectList(result.matchedPoints))}
          ${renderCompactSection("风险点", renderCompactObjectList(result.risks || item.risks))}
          ${renderCompactSection("投递建议", `<div class="jma-value">${escapeHtml(result.suggestion || item.suggestion || "暂无")}</div>`)}
        </div>
      </div>
    `;
  }

  function renderAnalysisHistory() {
    const items = historyDisplayItems();
    if (items.length === 0) {
      return "";
    }

    return `
      <div class="jma-history">
        ${renderHistoryDetail()}
        <div class="jma-label">收藏 / 最近分析</div>
        ${items.map(({ item, index }) => {
          const title = item.title || "未命名职位";
          const company = item.company ? ` · ${item.company}` : "";
          const scoreText = item.score || item.score === 0 ? `${item.score}分` : "暂无分数";
          const meta = [item.favorite ? "已收藏" : "最近", scoreText, item.level].filter(Boolean).join(" · ");
          const detail = item.suggestion || formatAnalysisTime(item.analyzedAt) || "暂无建议";
          return `
            <div class="jma-history-item">
              <div class="jma-history-main">${escapeHtml(title)}${escapeHtml(company)}</div>
              <div class="jma-history-meta">${escapeHtml(meta)}</div>
              <div class="jma-note">${escapeHtml(detail)}</div>
              <div class="jma-history-actions">
                <button class="jma-inline-button" data-history-view="${index}" type="button">查看</button>
                <button class="jma-inline-button" data-history-favorite="${index}" type="button">${item.favorite ? "取消收藏" : "收藏"}</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderJob(jobPost) {
    if (!hasUsableJob(jobPost)) {
      return `
        <section class="jma-section jma-card">
          <h3 class="jma-section-title">职位捕捉</h3>
          <div class="jma-empty">暂未稳定识别到当前职位信息。可以手动粘贴 JD 继续。</div>
        </section>
      `;
    }

    const sourceText = jobPost.captureSource && jobPost.captureSource !== "dom" ? "结构化数据已捕捉" : "";
    const companyText = jobPost.isHeadhunter
      ? (jobPost.delegatedCompany ? `委托：${jobPost.delegatedCompany}` : "委托公司未公开")
      : jobPost.company;
    const recruiterText = jobPost.isHeadhunter && jobPost.recruiterCompany
      ? `招聘方：${jobPost.recruiterCompany}`
      : "";
    const salaryStyle = jobPost.salaryFontFamily ? ` style="font-family: ${escapeHtml(jobPost.salaryFontFamily)}"` : "";
    const metaItems = [
      companyText,
      recruiterText,
      jobPost.experienceRequirement,
      jobPost.educationRequirement,
      ...(jobPost.skills || []).slice(0, 3)
    ];

    return `
      <section class="jma-section jma-card jma-job-card">
        <div class="jma-section-head">
          <h3 class="jma-section-title">当前职位</h3>
          ${sourceText ? `<span class="jma-soft-pill">${escapeHtml(sourceText)}</span>` : ""}
        </div>
        <div class="jma-job-title-row">
          <div class="jma-job-title">${escapeHtml(jobPost.title || "未识别职位")}</div>
          ${jobPost.salary ? `<div class="jma-job-salary"${salaryStyle}>${escapeHtml(jobPost.salary)}</div>` : ""}
        </div>
        ${renderMetaChips(metaItems)}
        <button class="jma-inline-button jma-ghost-button" data-toggle-job-detail type="button">
          ${state.jobDetailsExpanded ? "收起 JD" : "查看 JD"}
        </button>
        ${state.jobDetailsExpanded ? `
          <div class="jma-description">${escapeHtml(jobPost.description)}</div>
        ` : ""}
      </section>
    `;
  }

  function renderManualFallback() {
    if (!state.manualFallbackExpanded) {
      return "";
    }

    return `
      <section class="jma-section jma-card">
        <h3 class="jma-section-title">手动兜底</h3>
        <textarea class="jma-textarea" id="jma-manual-jd" placeholder="如果自动捕捉失败，可以粘贴职位 JD。">${escapeHtml(
          state.manualDescription
        )}</textarea>
        <button class="jma-button" id="jma-use-manual-jd" type="button">使用手动 JD</button>
      </section>
    `;
  }

  function renderAnalysisPlaceholder(jobPost) {
    const resumeSkills = state.resumeProfileDraft && Array.isArray(state.resumeProfileDraft.skills)
      ? state.resumeProfileDraft.skills
      : [];
    const hasResume = Boolean(state.resumeRawText);
    const result = state.aiMatchResult;
    const targetText = state.targetRole ? `目标岗位：${state.targetRole}` : "目标岗位：未填写";
    const resumeText = hasResume ? `简历：已保存，约 ${state.resumeRawText.length} 字` : "简历：未上传";
    const readyText = !hasUsableJob(jobPost)
      ? "等待职位信息。自动捕捉失败时可使用手动 JD。"
      : !state.targetRole || !hasResume
        ? "请先在设置页填写目标岗位并保存简历。"
        : "点击 AI 分析，将调用本地后端生成可解释的匹配结论。";
    const canAnalyze = hasUsableJob(jobPost) && state.targetRole && hasResume && !state.aiMatchLoading;
    const score = result && (result.score || result.score === 0) ? Number(result.score) : 0;
    const scoreWidth = scorePercent(score, 100);
    const topRisks = result && Array.isArray(result.risks) ? result.risks.slice(0, 2) : [];

    return `
      <section class="jma-section jma-card">
        <h3 class="jma-section-title">匹配分析</h3>
        <div class="jma-context-row">
          <span>${escapeHtml(targetText)}</span>
          <span>${escapeHtml(resumeText)}</span>
        </div>
        ${!result ? `
          <div class="jma-field">
            <div class="jma-label">基础解析技能</div>
            ${renderBadges(resumeSkills.slice(0, 6))}
          </div>
        ` : ""}
        ${!result ? `<div class="jma-status">${escapeHtml(readyText)}</div>` : ""}
        ${state.aiMatchError ? `<div class="jma-error">${escapeHtml(state.aiMatchError)}</div>` : ""}
        ${result ? `
          <div class="jma-match-card">
            <div class="jma-match-main">
              <div class="jma-label">AI 匹配</div>
              <div class="jma-suggestion">${escapeHtml(result.suggestion || "暂无投递建议")}</div>
              <div class="jma-match-scoreline">
                <span>${escapeHtml(result.score)}分</span>
                <span>${escapeHtml(result.level || "")}</span>
              </div>
              <div class="jma-match-meter">
                <div class="jma-match-meter-fill" style="width: ${scoreWidth}%"></div>
              </div>
              ${result.summary ? `<div class="jma-match-summary-text">${escapeHtml(result.summary)}</div>` : ""}
            </div>
          </div>
          ${topRisks.length > 0 ? `
            <div class="jma-risk-strip">
              <div class="jma-label">主要风险</div>
              ${renderCompactObjectList(topRisks, { limit: 2 })}
            </div>
          ` : ""}
          ${renderScoreBars(result.scoreBreakdown)}
          <button class="jma-inline-button jma-ghost-button" data-toggle-analysis-detail type="button">
            ${state.analysisDetailsExpanded ? "收起分析详情" : "展开分析详情"}
          </button>
          ${state.analysisDetailsExpanded ? `
            <div class="jma-analysis-compact">
              ${renderCompactSection("匹配点", renderCompactObjectList(result.matchedPoints, { limit: 4 }))}
              ${renderCompactSection("风险点", renderCompactObjectList(result.risks, { limit: 4 }))}
              ${renderCompactSection("简历亮点", renderCompactList(result.resumeHighlights, { limit: 4 }))}
              ${renderCompactSection("沟通建议", renderCompactList(result.communicationTips, { limit: 4 }))}
            </div>
          ` : ""}
        ` : ""}
        <div class="jma-primary-actions">
          <button class="jma-button" id="jma-run-ai-match" type="button" ${canAnalyze ? "" : "disabled"}>
            ${state.aiMatchLoading ? "分析中..." : "AI 分析"}
          </button>
        </div>
        <div class="jma-toolbar">
          <button class="jma-inline-button" id="jma-open-options" type="button">打开设置页</button>
          <button class="jma-inline-button" id="jma-export-job-sample" type="button">导出职位样例</button>
          <button class="jma-inline-button" data-toggle-manual-fallback type="button">
            ${state.manualFallbackExpanded ? "收起手动兜底" : "手动兜底"}
          </button>
        </div>
        ${state.jobSampleExportMessage ? "<div class=\"jma-debug-note\">" + escapeHtml(state.jobSampleExportMessage) + "</div>" : ""}
        ${renderAnalysisHistory()}
      </section>
    `;
  }

  function root() {
    let element = document.getElementById(ROOT_ID);
    if (!element) {
      element = document.createElement("div");
      element.id = ROOT_ID;
      document.body.appendChild(element);
    }
    return element;
  }

  function render() {
    if (state.closed) {
      const element = document.getElementById(ROOT_ID);
      if (element) {
        element.remove();
      }
      return;
    }

    const jobPost = state.currentJob;
    const status = hasUsableJob(jobPost) ? "已自动捕捉当前职位" : "职位捕捉不完整";
    root().innerHTML = `
      <aside class="jma-panel" aria-label="求职匹配助手">
        <header class="jma-header">
          <h2 class="jma-title">求职匹配助手</h2>
          <button class="jma-close" id="jma-close" type="button" aria-label="关闭">×</button>
        </header>
        <div class="jma-body">
          <div class="jma-status">${escapeHtml(status)}</div>
          ${renderJob(jobPost)}
          ${renderAnalysisPlaceholder(jobPost)}
          ${renderManualFallback()}
        </div>
      </aside>
    `;

    bindEvents();
  }

  function bindEvents() {
    const closeButton = document.getElementById("jma-close");
    if (closeButton) {
      closeButton.addEventListener("click", () => {
        state.closed = true;
        render();
      });
    }

    const manualButton = document.getElementById("jma-use-manual-jd");
    if (manualButton) {
      manualButton.addEventListener("click", () => {
        const textarea = document.getElementById("jma-manual-jd");
        state.manualDescription = textarea ? textarea.value.trim() : "";
        if (state.manualDescription) {
          state.currentJob = {
            ...extractJobPost(),
            description: state.manualDescription,
            capturedBy: "manual"
          };
          state.aiMatchResult = null;
          state.aiMatchError = "";
          render();
        }
      });
    }

    const optionsButton = document.getElementById("jma-open-options");
    if (optionsButton) {
      optionsButton.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
      });
    }

    const aiMatchButton = document.getElementById("jma-run-ai-match");
    if (aiMatchButton) {
      aiMatchButton.addEventListener("click", runAiMatch);
    }

    const exportJobSampleButton = document.getElementById("jma-export-job-sample");
    if (exportJobSampleButton) {
      exportJobSampleButton.addEventListener("click", exportCurrentJobSample);
    }

    const jobDetailButton = document.querySelector("[data-toggle-job-detail]");
    if (jobDetailButton) {
      jobDetailButton.addEventListener("click", () => {
        state.jobDetailsExpanded = !state.jobDetailsExpanded;
        render();
      });
    }

    const analysisDetailButton = document.querySelector("[data-toggle-analysis-detail]");
    if (analysisDetailButton) {
      analysisDetailButton.addEventListener("click", () => {
        state.analysisDetailsExpanded = !state.analysisDetailsExpanded;
        render();
      });
    }

    const manualFallbackButton = document.querySelector("[data-toggle-manual-fallback]");
    if (manualFallbackButton) {
      manualFallbackButton.addEventListener("click", () => {
        state.manualFallbackExpanded = !state.manualFallbackExpanded;
        render();
      });
    }

    document.querySelectorAll("[data-history-view]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedHistoryIndex = Number(button.dataset.historyView);
        render();
      });
    });

    document.querySelectorAll("[data-history-favorite]").forEach((button) => {
      button.addEventListener("click", () => {
        toggleAnalysisFavorite(Number(button.dataset.historyFavorite));
      });
    });

    const closeDetailButton = document.querySelector("[data-history-close-detail]");
    if (closeDetailButton) {
      closeDetailButton.addEventListener("click", () => {
        state.selectedHistoryIndex = null;
        render();
      });
    }
  }

  function normalizeAnalysisHistory(value) {
    return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
  }

  function persistAnalysisHistory(nextHistory) {
    state.analysisHistory = normalizeAnalysisHistory(nextHistory).slice(0, MAX_ANALYSIS_HISTORY);

    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      return;
    }

    chrome.storage.local.set({ analysisHistory: state.analysisHistory });
  }

  function toggleAnalysisFavorite(index) {
    const history = normalizeAnalysisHistory(state.analysisHistory);
    if (!history[index]) {
      return;
    }

    history[index] = {
      ...history[index],
      favorite: !history[index].favorite
    };
    persistAnalysisHistory(history);
    render();
  }

  function buildAnalysisHistoryItem(jobPost, result) {
    return {
      title: jobPost.title || "",
      company: jobPost.company || "",
      salary: jobPost.salary || "",
      jobId: jobPost.jobId || "",
      url: jobPost.url || location.href,
      score: result.score,
      level: result.level || "",
      suggestion: result.suggestion || result.summary || "",
      risks: Array.isArray(result.risks) ? result.risks : [],
      matchResult: result,
      targetRole: state.targetRole || "",
      favorite: false,
      analyzedAt: new Date().toISOString()
    };
  }

  function saveAnalysisHistory(jobPost, result) {
    const item = buildAnalysisHistoryItem(jobPost, result);
    const currentHistory = normalizeAnalysisHistory(state.analysisHistory);
    persistAnalysisHistory([item, ...currentHistory]);
    state.selectedHistoryIndex = 0;
  }

  async function readErrorMessage(response) {
    try {
      const contentType = response.headers && response.headers.get ? response.headers.get("content-type") : "";
      if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        return data && (data.error || data.message) ? data.error || data.message : "";
      }

      return await response.text();
    } catch (error) {
      return "";
    }
  }

  async function requestLocalAnalysis(payload) {
    let response;

    try {
      response = await fetch(LOCAL_ANALYZE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      throw new Error("本地分析服务未启动或无法访问，请先运行本地后端（localhost:3000）后重试。");
    }

    if (!response.ok) {
      const message = await readErrorMessage(response);
      throw new Error(message || `本地分析服务返回错误（HTTP ${response.status}）。`);
    }

    return response.json();
  }

  async function runAiMatch() {
    if (!hasUsableJob(state.currentJob) || !state.targetRole || !state.resumeRawText || state.aiMatchLoading) {
      return;
    }

    state.aiMatchLoading = true;
    state.aiMatchError = "";
    render();

    try {
      const result = await requestLocalAnalysis({
        resumeRawText: state.resumeRawText,
        resumeProfileDraft: state.resumeProfileDraft,
        targetRole: state.targetRole,
        jobPost: state.currentJob
      });

      state.aiMatchResult = result;
      saveAnalysisHistory(state.currentJob, result);
    } catch (error) {
      state.aiMatchError = error && error.message ? error.message : "AI 分析失败。";
    } finally {
      state.aiMatchLoading = false;
      render();
    }
  }

  function updateJobPost() {
    if (state.closed) {
      return;
    }

    const nextJob = extractJobPost();
    const previousKey = state.currentJob
      ? `${state.currentJob.jobId || ""}|${state.currentJob.title}|${state.currentJob.company}|${state.currentJob.recruiterCompany || ""}|${state.currentJob.delegatedCompany || ""}|${state.currentJob.salary}|${state.currentJob.description}`
      : "";
    const nextKey = `${nextJob.jobId || ""}|${nextJob.title}|${nextJob.company}|${nextJob.recruiterCompany || ""}|${nextJob.delegatedCompany || ""}|${nextJob.salary}|${nextJob.description}`;

    if (previousKey !== nextKey) {
      state.currentJob = nextJob;
      state.aiMatchResult = null;
      state.aiMatchError = "";
      state.jobSampleExportMessage = "";
      state.jobDetailsExpanded = false;
      state.analysisDetailsExpanded = false;
      state.manualFallbackExpanded = false;
      render();
    }
  }

  function observeStructuredJobInfo() {
    window.addEventListener("message", (event) => {
      if (event.source !== window || !event.data || event.data.source !== "job-match-assistant") {
        return;
      }
      if (event.data.type !== "BOSS_JOB_INFO") {
        return;
      }

      state.structuredJobInfo = event.data.payload || null;
      updateJobPost();
    });
  }

  function downloadJson(filename, text) {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }

  async function exportCurrentJobSample() {
    if (!window.JobMatchSampleExport || typeof window.JobMatchSampleExport.buildBossJobSampleExport !== "function") {
      state.jobSampleExportMessage = "导出工具未加载，请刷新页面后重试。";
      render();
      return;
    }

    const domJob = extractDomJobPost();
    const mergedJob = window.JobMatchJobInfo && typeof window.JobMatchJobInfo.mergeStructuredJobInfo === "function"
      ? window.JobMatchJobInfo.mergeStructuredJobInfo(domJob, state.structuredJobInfo)
      : domJob;
    const sample = window.JobMatchSampleExport.buildBossJobSampleExport({
      url: location.href,
      pageTitle: document.title,
      capturedAt: new Date().toISOString(),
      rawStructuredJobInfo: state.structuredJobInfo,
      domJob,
      mergedJob
    });
    const text = JSON.stringify(sample, null, 2);

    try {
      const copied = await copyText(text);
      state.jobSampleExportMessage = copied
        ? "职位样例 JSON 已复制，可直接发给我。"
        : "复制失败，已下载 JSON 文件。";
      if (!copied) {
        downloadJson(sample.caseId + ".json", text);
      }
    } catch (error) {
      downloadJson(sample.caseId + ".json", text);
      state.jobSampleExportMessage = "复制被浏览器拦截，已下载 JSON 文件。";
    }

    render();
  }

  function loadSettings() {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      render();
      return;
    }

    chrome.storage.local.get(["targetRole", "resumeRawText", "resumeProfileDraft", "analysisHistory"], (result) => {
      state.targetRole = result.targetRole || "";
      state.resumeRawText = result.resumeRawText || "";
      state.resumeProfileDraft = result.resumeProfileDraft || null;
      state.analysisHistory = normalizeAnalysisHistory(result.analysisHistory);
      render();
    });
  }

  function observeSettingsChanges() {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.onChanged) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }

      if (changes.targetRole) {
        state.targetRole = changes.targetRole.newValue || "";
        state.aiMatchResult = null;
      }
      if (changes.resumeRawText) {
        state.resumeRawText = changes.resumeRawText.newValue || "";
        state.aiMatchResult = null;
      }
      if (changes.resumeProfileDraft) {
        state.resumeProfileDraft = changes.resumeProfileDraft.newValue || null;
      }
      if (changes.analysisHistory) {
        state.analysisHistory = normalizeAnalysisHistory(changes.analysisHistory.newValue);
        if (state.selectedHistoryIndex !== null && !state.analysisHistory[state.selectedHistoryIndex]) {
          state.selectedHistoryIndex = null;
        }
      }

      render();
    });
  }

  function debounce(fn, delay) {
    let timer = 0;
    return function debounced() {
      window.clearTimeout(timer);
      timer = window.setTimeout(fn, delay);
    };
  }

  function observePageChanges() {
    const debouncedUpdate = debounce(updateJobPost, 600);
    const observer = new MutationObserver(debouncedUpdate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    window.addEventListener("popstate", debouncedUpdate);
    window.addEventListener("hashchange", debouncedUpdate);
  }

  function init() {
    if (!document.body || document.getElementById(ROOT_ID)) {
      return;
    }

    loadSettings();
    observeStructuredJobInfo();
    updateJobPost();
    observeSettingsChanges();
    observePageChanges();
  }

  init();
})();
