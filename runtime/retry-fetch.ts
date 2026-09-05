const UPSTAGE_URL = "https://api.upstage.ai/v1/chat/completions";
const RETRY_JITTER_MS = 250;

function defaultMatches(url, payload) {
  return url === UPSTAGE_URL && payload?.model === "solar-pro4";
}

function defaultSleep(delayMs, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? abortError());
      return;
    }

    const finish = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? abortError());
    };
    const timer = setTimeout(finish, delayMs);
    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

function abortError() {
  if (typeof DOMException === "function") {
    return new DOMException("The operation was aborted", "AbortError");
  }
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw signal.reason ?? abortError();
  }
}

function positiveNumber(value, name, { allowZero = false } = {}) {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new TypeError(`${name} must be a finite ${allowZero ? "non-negative" : "positive"} number`);
  }
  return value;
}

function getUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input.url === "string") return input.url;
  return String(input);
}

function getSignal(input, init) {
  return init?.signal ?? input?.signal;
}

async function bodyDetails(input, init) {
  const hasInitBody = init != null && Object.hasOwn(init, "body");
  const body = hasInitBody ? init.body : null;
  if (typeof body === "string") {
    return parseJsonBody(body, true);
  }
  if (body instanceof URLSearchParams) {
    return { payload: null, replayable: true };
  }
  if (body instanceof ArrayBuffer) {
    return parseBytes(new Uint8Array(body), true);
  }
  if (ArrayBuffer.isView(body)) {
    return parseBytes(new Uint8Array(body.buffer, body.byteOffset, body.byteLength), true);
  }
  if (body == null) {
    if (!hasInitBody && input && typeof input.clone === "function" && input.body != null) {
      try {
        const text = await input.clone().text();
        return parseJsonBody(text, false);
      } catch {
        return { payload: null, replayable: false };
      }
    }
    return { payload: null, replayable: true };
  }
  return { payload: null, replayable: false };
}

function parseBytes(bytes, replayable) {
  try {
    const text = new TextDecoder().decode(bytes);
    return parseJsonBody(text, replayable);
  } catch {
    return { payload: null, replayable };
  }
}

function parseJsonBody(text, replayable) {
  try {
    return { payload: JSON.parse(text), replayable };
  } catch {
    return { payload: null, replayable };
  }
}

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name);
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return String(value);
  }
  return null;
}

function finiteHeader(headers, name) {
  const raw = headerValue(headers, name);
  if (raw == null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function unixSecondsDelay(headers, name, currentTime) {
  const value = finiteHeader(headers, name);
  return value == null ? null : Math.max(0, value * 1000 - currentTime);
}

function retryAfterDelay(headers, currentTime) {
  const raw = headerValue(headers, "retry-after");
  if (raw == null || raw.trim() === "") return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - currentTime) : null;
}

async function discardResponseBody(response) {
  if (response?.body == null) return true;
  if (typeof response.body.cancel === "function") {
    try {
      await response.body.cancel();
      return true;
    } catch {}
  }
  for (const method of ["arrayBuffer", "text"]) {
    if (typeof response[method] !== "function") continue;
    try {
      await response[method]();
      return true;
    } catch {}
  }
  return false;
}

export function createRetryingFetch(baseFetch, options = {}) {
  if (typeof baseFetch !== "function") throw new TypeError("baseFetch must be a function");
  const maxRetries = options.maxRetries ?? 5;
  if (!Number.isInteger(maxRetries) || maxRetries < 0) throw new TypeError("maxRetries must be a non-negative integer");
  const maxWaitMs = positiveNumber(options.maxWaitMs ?? 1_200_000, "maxWaitMs", { allowZero: true });
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const matches = options.matches ?? defaultMatches;
  const random = options.random ?? Math.random;
  const onWait = options.onWait ?? (() => {});
  const onState = options.onState ?? (() => {});
  let state = { mode: "retry-only", status: "idle", attempt: 0, retryAt: null };

  function update(status, attempt, retryAt = null) {
    state = { mode: "retry-only", status, attempt, retryAt };
    onState({ ...state });
  }

  function retryDelay(headers, retryIndex) {
    const currentTime = now();
    const candidates = [
      retryAfterDelay(headers, currentTime),
      unixSecondsDelay(headers, "x-upstage-ratelimit-retry-after-requests", currentTime),
      unixSecondsDelay(headers, "x-upstage-ratelimit-retry-after-tokens", currentTime),
      unixSecondsDelay(headers, "x-upstage-ratelimit-reset-requests", currentTime),
      unixSecondsDelay(headers, "x-upstage-ratelimit-reset-tokens", currentTime),
    ].filter(value => value != null);
    const delay = candidates.length ? Math.max(...candidates) : Math.min(60_000 * 2 ** retryIndex, 300_000);
    return delay + Math.floor(Math.max(0, Math.min(1, random())) * RETRY_JITTER_MS);
  }

  async function waitForRetry(delayMs, signal) {
    throwIfAborted(signal);
    let removeAbortListener = () => {};
    const aborted = signal && new Promise((_, reject) => {
      const onAbort = () => reject(signal.reason ?? abortError());
      signal.addEventListener("abort", onAbort, { once: true });
      removeAbortListener = () => signal.removeEventListener("abort", onAbort);
    });
    try {
      await (aborted ? Promise.race([sleep(delayMs, signal), aborted]) : sleep(delayMs, signal));
      throwIfAborted(signal);
    } finally {
      removeAbortListener();
    }
  }

  async function retryingFetch(input, init) {
    const details = await bodyDetails(input, init);
    if (!matches(getUrl(input), details.payload)) return baseFetch(input, init);
    const signal = getSignal(input, init);
    let waitedMs = 0;
    let attempt = 0;
    try {
      while (true) {
        throwIfAborted(signal);
        update("requesting", ++attempt);
        const response = await baseFetch(input, init);
        if (response?.status !== 429 || !details.replayable || attempt > maxRetries) {
          update(response?.status === 429 ? "exhausted" : "response", attempt);
          return response;
        }
        const delayMs = retryDelay(response.headers, attempt - 1);
        if (delayMs > maxWaitMs - waitedMs || !await discardResponseBody(response)) {
          update("exhausted", attempt);
          return response;
        }
        update("waiting", attempt, now() + delayMs);
        onWait({ delayMs, reason: "429", attempt, maxRetries });
        await waitForRetry(delayMs, signal);
        waitedMs += delayMs;
      }
    } catch (error) {
      update(signal?.aborted ? "aborted" : "error", attempt);
      throw error;
    }
  }

  retryingFetch.snapshot = () => ({ ...state });
  return retryingFetch;
}
