const express = require("express");

const { analyzeMatch } = require("./match-analysis.js");
const { structureResume } = require("./resume-structure.js");

function isAllowedCorsOrigin(origin) {
  return !origin || origin.startsWith("chrome-extension://") || origin === "https://www.zhipin.com";
}

function applyCors(req, res, next) {
  const origin = req.headers.origin || "";
  if (isAllowedCorsOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
}

function createApp({ fetchImpl = globalThis.fetch, env = process.env } = {}) {
  const app = express();

  app.use(applyCors);
  app.use(express.json({ limit: "1mb" }));

  app.post("/api/resume/structure", async (req, res) => {
    try {
      const result = await structureResume({
        resumeRawText: req.body && req.body.resumeRawText,
        fetchImpl,
        env
      });
      res.json(result);
    } catch (error) {
      const status = /不能为空|缺少/.test(error.message) ? 400 : 502;
      res.status(status).json({ error: error.message });
    }
  });

  app.post("/api/match/analyze", async (req, res) => {
    try {
      const body = req.body || {};
      const result = await analyzeMatch({
        resumeRawText: body.resumeRawText,
        resumeProfileDraft: body.resumeProfileDraft,
        targetRole: body.targetRole,
        jobPost: body.jobPost,
        fetchImpl,
        env
      });
      res.json(result);
    } catch (error) {
      const status = /不能为空|缺少/.test(error.message) ? 400 : 502;
      res.status(status).json({ error: error.message });
    }
  });

  return app;
}

module.exports = {
  createApp,
  isAllowedCorsOrigin
};
