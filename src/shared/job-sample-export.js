(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.JobMatchSampleExport = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function compactTimestamp(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) {
      return new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    }
    return date.toISOString().replace(/\D/g, "").slice(0, 14);
  }

  function normalizeIdPart(value) {
    return String(value || "")
      .trim()
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
  }

  function pickExpected(job) {
    const source = job && typeof job === "object" ? job : {};
    return {
      jobId: source.jobId || "",
      title: source.title || "",
      company: source.company || "",
      recruiterCompany: source.recruiterCompany || "",
      delegatedCompany: source.delegatedCompany || "",
      salary: source.salary || "",
      experienceRequirement: source.experienceRequirement || "",
      educationRequirement: source.educationRequirement || "",
      description: source.description || "",
      isHeadhunter: Boolean(source.isHeadhunter)
    };
  }

  function buildBossJobSampleExport(input = {}) {
    const capturedAt = input.capturedAt || new Date().toISOString();
    const mergedJob = input.mergedJob || {};
    const jobId = mergedJob.jobId || input.rawStructuredJobInfo && (
      input.rawStructuredJobInfo.encryptId ||
      input.rawStructuredJobInfo.job_id ||
      input.rawStructuredJobInfo.jobId
    );
    const idPart = normalizeIdPart(jobId || mergedJob.title || "unknown");

    return {
      schemaVersion: 1,
      caseId: `boss-job-${compactTimestamp(capturedAt)}-${idPart}`,
      source: "boss",
      scenario: mergedJob.isHeadhunter ? "headhunter" : "normal",
      page: {
        url: input.url || "",
        title: input.pageTitle || "",
        capturedAt
      },
      input: {
        rawStructuredJobInfo: input.rawStructuredJobInfo || null,
        domJob: input.domJob || null
      },
      actual: mergedJob,
      expected: pickExpected(mergedJob),
      fieldSources: mergedJob.fieldSources || {},
      notes: ""
    };
  }

  return {
    buildBossJobSampleExport
  };
});
