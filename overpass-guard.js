(() => {
  "use strict";

  const nativeFetch = window.fetch.bind(window);
  const OVERPASS_HOSTS = new Set(["overpass-api.de", "overpass.kumi.systems"]);
  const QUIET_MS = 420;
  const BETWEEN_REQUESTS_MS = 120;

  let active = null;
  let queued = null;
  let recentFailure = null;

  const fakeEmptyResponse = () => ({
    ok: true,
    status: 200,
    json: async () => ({elements: []})
  });

  function isOverpassRequest(input, init = {}) {
    try {
      const url = new URL(typeof input === "string" ? input : input?.url, location.href);
      return OVERPASS_HOSTS.has(url.hostname) && String(init.method || input?.method || "GET").toUpperCase() === "POST";
    } catch (_) {
      return false;
    }
  }

  function queryKey(init = {}) {
    return typeof init.body === "string" ? init.body : "";
  }

  function settleSuperseded(job) {
    clearTimeout(job.timer);
    job.resolve(fakeEmptyResponse());
  }

  function schedule(job, delay = QUIET_MS) {
    job.timer = setTimeout(() => run(job), delay);
  }

  async function run(job) {
    if (queued !== job) return;
    queued = null;

    if (active) {
      queued = job;
      schedule(job, BETWEEN_REQUESTS_MS);
      return;
    }

    active = job;
    try {
      const response = await nativeFetch(job.input, job.init);
      if (!response.ok) recentFailure = {key: job.key, at: Date.now()};
      else recentFailure = null;
      job.resolve(response);
    } catch (error) {
      recentFailure = {key: job.key, at: Date.now()};
      job.reject(error);
    } finally {
      active = null;
      if (queued) {
        clearTimeout(queued.timer);
        schedule(queued, BETWEEN_REQUESTS_MS);
      }
    }
  }

  window.fetch = function guardedFetch(input, init = {}) {
    if (!isOverpassRequest(input, init)) return nativeFetch(input, init);

    const key = queryKey(init);

    // If an older request has just failed but a newer layer selection is already
    // waiting, do not let the older request's fallback endpoint jump the queue.
    if (recentFailure && recentFailure.key === key && queued && queued.key !== key && Date.now() - recentFailure.at < 3000) {
      return Promise.resolve(fakeEmptyResponse());
    }

    return new Promise((resolve, reject) => {
      const job = {input, init, key, resolve, reject, timer: null};

      if (queued) settleSuperseded(queued);
      queued = job;

      // Same-query fallback after a genuine failure should retry promptly when
      // there is no newer search waiting.
      const retrying = recentFailure && recentFailure.key === key && Date.now() - recentFailure.at < 3000;
      schedule(job, retrying ? BETWEEN_REQUESTS_MS : QUIET_MS);
    });
  };
})();
