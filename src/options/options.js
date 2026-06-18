import * as pdfjsLib from "../../node_modules/pdfjs-dist/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("node_modules/pdfjs-dist/build/pdf.worker.mjs");

const form = document.getElementById("settings-form");
const targetRoleInput = document.getElementById("target-role");
const statusElement = document.getElementById("status");
const resumeFileInput = document.getElementById("resume-file");
const resumeTextInput = document.getElementById("resume-text");
const saveResumeButton = document.getElementById("save-resume");
const saveProfileButton = document.getElementById("save-profile");
const clearResumeButton = document.getElementById("clear-resume");
const resumeStatusElement = document.getElementById("resume-status");
const resumeSummaryElement = document.getElementById("resume-summary");
const resumeNameElement = document.getElementById("resume-name");
const resumeContactElement = document.getElementById("resume-contact");
const resumeLocationElement = document.getElementById("resume-location");
const resumeSkillsElement = document.getElementById("resume-skills");
const resumeProfileJsonInput = document.getElementById("resume-profile-json");
const deleteResumeDataButton = document.getElementById("delete-resume-data");
const clearAnalysisHistoryButton = document.getElementById("clear-analysis-history");
const privacyStatusElement = document.getElementById("privacy-status");
const RESUME_STRUCTURE_API_URL = "http://localhost:3000/api/resume/structure";

function setStatus(message) {
  statusElement.textContent = message;
  window.clearTimeout(setStatus.timer);
  setStatus.timer = window.setTimeout(() => {
    statusElement.textContent = "";
  }, 2400);
}

function setResumeStatus(message, isError = false) {
  resumeStatusElement.textContent = message;
  resumeStatusElement.style.color = isError ? "#b3261e" : "#137333";
}

function setPrivacyStatus(message, isError = false) {
  privacyStatusElement.textContent = message;
  privacyStatusElement.style.color = isError ? "#b3261e" : "#137333";
}

function resetResumeView() {
  resumeFileInput.value = "";
  resumeTextInput.value = "";
  renderResumeProfile(null);
}

function normalizeResumeText(value) {
  return (value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
    throw new Error("结构化简历必须是 JSON 对象。");
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

function contactText(contact) {
  return Object.values(contact || {}).filter(Boolean).join(" / ");
}

function renderResumeProfile(profileDraft) {
  const hasResume = Boolean(profileDraft);
  resumeSummaryElement.classList.toggle("hidden", !hasResume);

  if (!hasResume) {
    resumeProfileJsonInput.value = "";
    return;
  }

  const profile = normalizeResumeProfile(profileDraft);
  resumeNameElement.textContent = profile.name || "未识别";
  resumeContactElement.textContent = contactText(profile.contact) || "未识别";
  resumeLocationElement.textContent = profile.location || "未识别";
  resumeSkillsElement.textContent = profile.skills.join(" / ") || "未识别";
  resumeProfileJsonInput.value = JSON.stringify(profile, null, 2);
}

function readProfileEditor() {
  const text = resumeProfileJsonInput.value.trim();
  if (!text) {
    throw new Error("请先结构化简历，或粘贴结构化简历 JSON。");
  }
  return normalizeResumeProfile(JSON.parse(text));
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsText(file, "utf-8");
  });
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsArrayBuffer(file);
  });
}

async function extractPdfText(file) {
  const buffer = await readFileAsArrayBuffer(file);
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ");
    pages.push(pageText);
  }

  return normalizeResumeText(pages.join("\n\n"));
}

async function structureResumeWithBackend(resumeRawText) {
  const response = await fetch(RESUME_STRUCTURE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ resumeRawText })
  });

  if (!response.ok) {
    let message = `后端结构化失败：${response.status}`;
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch (error) {
      const text = await response.text();
      message = text || message;
    }
    throw new Error(message);
  }

  return normalizeResumeProfile(await response.json());
}

async function handleResumeFile(file) {
  if (!file) {
    return;
  }

  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    try {
      setResumeStatus("正在解析 PDF...");
      const text = await extractPdfText(file);
      if (!text) {
        setResumeStatus("PDF 未提取到文本。如果是扫描版 PDF，需要后续接 OCR。", true);
        return;
      }
      resumeTextInput.value = text;
      renderResumeProfile(null);
      setResumeStatus(`已读取：${file.name}。请点击“结构化并保存简历”。`);
    } catch (error) {
      setResumeStatus(`PDF 解析失败：${error.message}`, true);
    }
    return;
  }

  try {
    const text = normalizeResumeText(await readFileAsText(file));
    resumeTextInput.value = text;
    renderResumeProfile(null);
    setResumeStatus(`已读取：${file.name}。请点击“结构化并保存简历”。`);
  } catch (error) {
    setResumeStatus(error.message, true);
  }
}

function loadSettings() {
  chrome.storage.local.get(["targetRole", "resumeRawText", "resumeProfileDraft"], (result) => {
    targetRoleInput.value = result.targetRole || "";
    resumeTextInput.value = result.resumeRawText || "";
    renderResumeProfile(result.resumeProfileDraft || null);
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const targetRole = targetRoleInput.value.trim();
  chrome.storage.local.set({ targetRole }, () => {
    setStatus("已保存");
  });
});

resumeFileInput.addEventListener("change", () => {
  handleResumeFile(resumeFileInput.files[0]);
});

resumeTextInput.addEventListener("input", () => {
  renderResumeProfile(null);
});

saveResumeButton.addEventListener("click", async () => {
  const resumeRawText = normalizeResumeText(resumeTextInput.value);

  if (!resumeRawText) {
    setResumeStatus("请先上传或粘贴简历文本。", true);
    return;
  }

  saveResumeButton.disabled = true;
  setResumeStatus("正在调用本地后端结构化简历...");
  try {
    const resumeProfileDraft = await structureResumeWithBackend(resumeRawText);
    chrome.storage.local.set({ resumeRawText, resumeProfileDraft }, () => {
      resumeTextInput.value = resumeRawText;
      renderResumeProfile(resumeProfileDraft);
      setResumeStatus("结构化简历已保存到本地浏览器。");
    });
  } catch (error) {
    setResumeStatus(error.message, true);
  } finally {
    saveResumeButton.disabled = false;
  }
});

saveProfileButton.addEventListener("click", () => {
  try {
    const resumeRawText = normalizeResumeText(resumeTextInput.value);
    const resumeProfileDraft = readProfileEditor();
    chrome.storage.local.set({ resumeRawText, resumeProfileDraft }, () => {
      renderResumeProfile(resumeProfileDraft);
      setResumeStatus("编辑后的结构化简历已保存。");
    });
  } catch (error) {
    setResumeStatus(`结构化简历 JSON 无效：${error.message}`, true);
  }
});

clearResumeButton.addEventListener("click", () => {
  chrome.storage.local.remove(["resumeRawText", "resumeProfileDraft"], () => {
    resetResumeView();
    setResumeStatus("简历数据已清空。");
  });
});

deleteResumeDataButton.addEventListener("click", () => {
  chrome.storage.local.remove(["resumeRawText", "resumeProfileDraft"], () => {
    resetResumeView();
    setResumeStatus("简历数据已删除。");
    setPrivacyStatus("已删除简历原文和结构化简历。");
  });
});

clearAnalysisHistoryButton.addEventListener("click", () => {
  chrome.storage.local.remove(["analysisHistory"], () => {
    setPrivacyStatus("已清空最近分析历史。");
  });
});

loadSettings();
