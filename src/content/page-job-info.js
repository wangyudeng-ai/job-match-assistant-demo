(function () {
  function cloneJobInfo(value) {
    if (!value || typeof value !== "object") {
      return null;
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      const shallow = {};
      Object.keys(value).forEach((key) => {
        const item = value[key];
        if (item == null || ["string", "number", "boolean"].includes(typeof item)) {
          shallow[key] = item;
        }
      });
      return shallow;
    }
  }

  function postJobInfo() {
    const jobInfo = cloneJobInfo(window._jobInfo);
    if (!jobInfo) {
      return;
    }

    window.postMessage(
      {
        source: "job-match-assistant",
        type: "BOSS_JOB_INFO",
        payload: jobInfo
      },
      "*"
    );
  }

  postJobInfo();
  window.setInterval(postJobInfo, 800);
})();
