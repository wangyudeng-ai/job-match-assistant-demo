(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.JobMatchJobInfo = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeMultiline(value) {
    return String(value || "")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function removeBossSourceNoise(value) {
    return String(value || "")
      .replace(/职位(?:BOSS)?直聘描述/g, "职位描述")
      .replace(/B直聘端/g, "B端")
      .replace(/来自BOSS直聘/g, "")
      .replace(/BOSS直聘/g, "")
      .replace(/kanzhun/gi, "")
      .replace(/boss/gi, "");
  }

  function cutBossPageTail(value) {
    const markers = ["安全提示", "工商信息", "公司名称", "法定代表人", "企业类型", "经营状态"];
    const cuts = markers
      .map((marker) => value.indexOf(marker))
      .filter((index) => index >= 0);

    return cuts.length > 0 ? value.slice(0, Math.min(...cuts)) : value;
  }

  function isDescriptionStartLine(value) {
    return /^(?:我们需要你|我们希望你|岗位职责|工作职责|工作内容|职位要求|任职要求|岗位要求|职责|要求)\s*[:：]?/.test(value) ||
      /^\d+\s*[、.．]/.test(value);
  }

  function isLikelyBossDescriptionText(value) {
    const text = normalizeMultiline(value);
    if (!text) {
      return false;
    }

    return /职位描述|岗位职责|工作职责|工作内容|职位要求|任职要求|岗位要求|我们需要你|我们希望你|职责\s*[:：]|要求\s*[:：]|^\s*\d+\s*[、.．]/m.test(text);
  }

  function cleanBossTagText(value) {
    const text = normalizeText(removeBossSourceNoise(value));
    if (!text || text === "直聘") {
      return "";
    }
    return text;
  }

  function cleanBossDescriptionText(value) {
    const lines = normalizeMultiline(cutBossPageTail(removeBossSourceNoise(value)))
      .split("\n")
      .map((line) => normalizeText(line))
      .filter(Boolean);

    if (lines[0] !== "职位描述") {
      return normalizeMultiline(lines.join("\n"));
    }

    const cleaned = [lines[0]];
    let foundBodyStart = false;
    for (let index = 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (!foundBodyStart && !isDescriptionStartLine(line)) {
        continue;
      }
      foundBodyStart = true;
      cleaned.push(line);
    }

    return normalizeMultiline(cleaned.join("\n"));
  }

  function extractDelegatedCompany(description) {
    const text = normalizeMultiline(description);
    const match = text.match(/(?:代招公司|委托公司|目标公司|客户公司)\s*[:：]\s*([^\n。；;]+)/);
    return match ? normalizeText(match[1]) : "";
  }

  function cleanCompanyName(value) {
    return normalizeText(value).replace(/^公司名称\s*/, "");
  }

  function extractHeadhunterCompanyInfo(input = {}) {
    const description = input.description || "";
    const tags = Array.isArray(input.tags) ? input.tags.join(" ") : "";
    const delegatedCompany = extractDelegatedCompany(description);
    const company = cleanCompanyName(input.company);
    const companyLooksRecruiter = /猎头|人力|人才|招聘|咨询|顾问/.test(company);
    const hasHeadhunterMarker = Boolean(input.isHeadhunter) ||
      companyLooksRecruiter ||
      /猎头|代招|委托公司|代招公司|招聘顾问|猎头顾问/.test(`${description} ${tags}`);
    const recruiterCompany = hasHeadhunterMarker && companyLooksRecruiter ? company : "";
    const delegatedCompanyFromName = hasHeadhunterMarker && !companyLooksRecruiter ? company : "";

    return {
      isHeadhunter: hasHeadhunterMarker,
      recruiterCompany,
      delegatedCompany: delegatedCompany && delegatedCompany !== recruiterCompany ? delegatedCompany : delegatedCompanyFromName
    };
  }

  function firstText(...values) {
    for (const value of values) {
      const text = normalizeText(value);
      if (text) {
        return text;
      }
    }
    return "";
  }

  function firstMultiline(...values) {
    for (const value of values) {
      const text = normalizeMultiline(value);
      if (text) {
        return text;
      }
    }
    return "";
  }

  function isTruthyMarker(value) {
    return value === true || value === 1 || value === "1" || value === "true";
  }

  function normalizeBossJobInfo(jobInfo) {
    if (!jobInfo || typeof jobInfo !== "object") {
      return null;
    }

    return {
      jobId: firstText(jobInfo.encryptId, jobInfo.job_id, jobInfo.jobId),
      title: firstText(jobInfo.jobName, jobInfo.job_name),
      company: firstText(jobInfo.company, jobInfo.brandName, jobInfo.brand_name),
      salary: firstText(jobInfo.salaryDesc, jobInfo.job_salary),
      experienceRequirement: firstText(jobInfo.experienceName, jobInfo.experience_name),
      educationRequirement: firstText(jobInfo.degreeName, jobInfo.degree_name),
      description: firstMultiline(jobInfo.postDescription, jobInfo.description, jobInfo.job_description),
      positionName: firstText(jobInfo.positionName, jobInfo.position_name),
      isHeadhunter: Boolean(isTruthyMarker(jobInfo.proxyJob) || isTruthyMarker(jobInfo.proxyType)),
      raw: jobInfo
    };
  }

  function mergeStructuredJobInfo(domJob, jobInfo) {
    const structured = normalizeBossJobInfo(jobInfo);
    if (!structured) {
      return domJob;
    }

    const hasStructuredDescription = Boolean(structured.description);
    const headhunterInfo = extractHeadhunterCompanyInfo({
      company: domJob.recruiterCompany || domJob.company,
      description: structured.description || domJob.description,
      tags: domJob.skills,
      isHeadhunter: structured.isHeadhunter || domJob.isHeadhunter
    });
    const delegatedCompany = domJob.delegatedCompany || headhunterInfo.delegatedCompany;
    const recruiterCompany = domJob.recruiterCompany || headhunterInfo.recruiterCompany;
    const isHeadhunter = structured.isHeadhunter || domJob.isHeadhunter || headhunterInfo.isHeadhunter;
    return {
      ...domJob,
      jobId: structured.jobId || domJob.jobId || "",
      title: structured.title || domJob.title || "",
      company: isHeadhunter && delegatedCompany ? delegatedCompany : structured.company || domJob.company || "",
      recruiterCompany,
      delegatedCompany,
      salary: structured.salary || domJob.salary || "",
      salaryFontFamily: structured.salary ? "" : domJob.salaryFontFamily || "",
      experienceRequirement: structured.experienceRequirement || domJob.experienceRequirement || "",
      educationRequirement: structured.educationRequirement || domJob.educationRequirement || "",
      description: structured.description || domJob.description || "",
      isHeadhunter,
      captureSource: hasStructuredDescription ? "structured" : "structured+dom",
      structuredJobInfo: structured.raw
    };
  }

  return {
    normalizeBossJobInfo,
    mergeStructuredJobInfo,
    cleanBossDescriptionText,
    cleanBossTagText,
    extractHeadhunterCompanyInfo,
    isLikelyBossDescriptionText
  };
});
