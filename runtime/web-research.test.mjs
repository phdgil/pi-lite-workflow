import assert from "node:assert/strict";
import test from "node:test";
import {
  WEB_LIMIT,
  WEB_NOTICE,
  createTavilyClient,
  prepareWebRequest,
  publicWebUrl,
  requireWebAccess,
  validateWebEvidence,
  webPolicy,
  webResearchContext,
} from "./web-research.ts";

const apiKey = "tvly-unit-test-secret";
const sourceUrl = "https://docs.example.com/source";

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

function activeWorkflow(overrides = {}) {
  return {
    status: "active",
    stage: "research",
    webPolicy: "tavily",
    researchPass: 1,
    webEvidence: [],
    ...overrides,
  };
}

function receipt(kind, status = "ok", pass = 1, results = []) {
  return { kind, status, pass, results };
}

test("Tavily search uses the constant destination, exact authorization header, and bounded basic body", async () => {
  let observed;
  const client = createTavilyClient({
    getApiKey: () => `  ${apiKey}  `,
    fetch: async (url, init) => {
      observed = { url, init };
      return jsonResponse({ request_id: "request-1", results: [{ url: sourceUrl, title: "Docs", content: "Result" }] });
    },
  });

  const result = await client.request("search", { query: "  solar storage  " });
  assert.equal(client.configured(), true);
  assert.equal(observed.url, "https://api.tavily.com/search");
  assert.deepEqual(observed.init.headers, { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" });
  assert.equal(observed.init.method, "POST");
  assert.equal(observed.init.redirect, "error");
  assert.deepEqual(JSON.parse(observed.init.body), {
    query: "solar storage",
    search_depth: "basic",
    max_results: 5,
    auto_parameters: false,
    include_answer: false,
    include_raw_content: false,
    include_images: false,
  });
  assert.equal(observed.init.body.includes(apiKey), false);
  assert.equal(result.notice, WEB_NOTICE);
  assert.equal(result.results.length, 1);
});

test("extract accepts at most three URLs, sets provider timeout, and preserves partial failures", async () => {
  let observed;
  const urls = ["https://one.example/a", "https://two.example/b", "https://three.example/c"];
  const client = createTavilyClient({
    getApiKey: () => apiKey,
    fetch: async (url, init) => {
      observed = { url, init };
      return jsonResponse({
        request_id: "extract-1",
        results: [{ url: urls[0], raw_content: "full page" }],
        failed_results: [{ url: urls[1], error: "provider could not read page" }],
      });
    },
  });

  const result = await client.request("read", { urls });
  assert.equal(observed.url, "https://api.tavily.com/extract");
  assert.deepEqual(JSON.parse(observed.init.body), {
    urls,
    extract_depth: "basic",
    format: "markdown",
    timeout: 10,
    include_images: false,
  });
  assert.deepEqual(result.failures, [{ url: urls[1], error: "provider could not read page" }]);
  assert.throws(() => prepareWebRequest("read", { urls: [...urls, "https://four.example/d"] }), /one to three/i);
});

test("results are capped, marked when truncated, and redact API keys from all provider text", async () => {
  const searchContent = `${apiKey} tvly-provider-secret ${"x".repeat(2100)}`;
  const readContent = `${apiKey} tvly-provider-secret ${"y".repeat(12100)}`;
  const responses = [
    jsonResponse({
      request_id: `${apiKey}-request`,
      results: Array.from({ length: 7 }, (_, index) => ({
        url: `https://result${index}.example/page`,
        title: index === 0 ? `title ${apiKey}` : `title ${index}`,
        content: index === 0 ? searchContent : `content ${index}`,
      })),
    }),
    jsonResponse({
      results: [{ url: sourceUrl, title: apiKey, raw_content: readContent }],
      failed_results: [{ url: "https://failed.example/page", error: `provider error ${apiKey} tvly-leaked-secret` }],
    }),
  ];
  const client = createTavilyClient({ getApiKey: () => apiKey, fetch: async () => responses.shift() });

  const search = await client.request("search", { query: "bounded result test" });
  const read = await client.request("read", { urls: [sourceUrl] });
  assert.equal(search.results.length, 5);
  assert.equal(search.results[0].content.length, 2000);
  assert.equal(search.results[0].truncated, true);
  assert.equal(read.results[0].content.length, 12000);
  assert.equal(read.results[0].truncated, true);
  assert.equal(JSON.stringify({ search, read }).includes(apiKey), false);
  assert.equal(JSON.stringify({ search, read }).includes("tvly-provider-secret"), false);
  assert.equal(JSON.stringify({ search, read }).includes("tvly-leaked-secret"), false);
  assert.match(read.failures[0].error, /\[REDACTED\]/);
});

test("provider HTTP errors never expose raw responses and requests are never retried", async () => {
  let calls = 0;
  const client = createTavilyClient({
    getApiKey: () => apiKey,
    fetch: async () => {
      calls += 1;
      return new Response(`sensitive provider response ${apiKey}`, { status: 500 });
    },
  });

  await assert.rejects(client.request("search", { query: "provider failure" }), error => {
    assert.equal(error.status, 500);
    assert.match(error.message, /HTTP 500/);
    assert.doesNotMatch(error.message, /sensitive|unit-test-secret/);
    return true;
  });
  assert.equal(calls, 1);

  const connectionClient = createTavilyClient({
    getApiKey: () => apiKey,
    fetch: async () => {
      calls += 1;
      throw new Error("network secret");
    },
  });
  await assert.rejects(connectionClient.request("search", { query: "connection failure" }), error => error.status === "connection" && /No automatic charged retry/.test(error.message));
  assert.equal(calls, 2);
});

test("429 responses parse numeric and HTTP-date Retry-After without retrying", async () => {
  const future = new Date(Date.now() + 120_000);
  future.setMilliseconds(0);
  const responses = [
    new Response("limited", { status: 429, headers: { "retry-after": "1.5" } }),
    new Response("limited", { status: 429, headers: { "retry-after": future.toUTCString() } }),
  ];
  let calls = 0;
  const client = createTavilyClient({ getApiKey: () => apiKey, fetch: async () => responses[calls++] });

  await assert.rejects(client.request("search", { query: "rate limit numeric" }), error => error.status === 429 && error.retryAfterMs === 1500);
  await assert.rejects(client.request("search", { query: "rate limit date" }), error => {
    assert.equal(error.status, 429);
    assert.ok(error.retryAfterMs > 110_000 && error.retryAfterMs <= 120_000);
    return true;
  });
  assert.equal(calls, 2);
});

test("a missing API key fails before fetch", async () => {
  let calls = 0;
  const client = createTavilyClient({ getApiKey: () => "  ", fetch: async () => { calls += 1; } });
  assert.equal(client.configured(), false);
  await assert.rejects(client.request("search", { query: "public query" }), error => error.status === "missing_key" && /Never paste/.test(error.message));
  assert.equal(calls, 0);
});

test("external cancellation and internal timeout are conveyed through the composed signal", async () => {
  const waitForAbort = async (_url, { signal }) => new Promise((resolve, reject) => {
    assert.equal(signal.aborted, false);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  const controller = new AbortController();
  const cancelledClient = createTavilyClient({ getApiKey: () => apiKey, fetch: waitForAbort, timeoutMs: 1000 });
  const cancelled = cancelledClient.request("search", { query: "cancel fixture" }, controller.signal);
  controller.abort();
  await assert.rejects(cancelled, error => error.status === "aborted" && /cancelled/.test(error.message));

  const timeoutClient = createTavilyClient({ getApiKey: () => apiKey, fetch: waitForAbort, timeoutMs: 5 });
  await assert.rejects(timeoutClient.request("search", { query: "timeout fixture" }), error => error.status === "connection" && /timed out/.test(error.message));
});

test("malformed JSON, missing results, and oversized bodies fail as bounded responses", async () => {
  const malformed = createTavilyClient({ getApiKey: () => apiKey, fetch: async () => new Response("not json") });
  await assert.rejects(malformed.request("search", { query: "malformed json" }), error => error.status === "response" && /unreadable/.test(error.message));

  const missing = createTavilyClient({ getApiKey: () => apiKey, fetch: async () => jsonResponse({ answer: "unsupported" }) });
  await assert.rejects(missing.request("search", { query: "missing results" }), error => error.status === "response" && /results array/.test(error.message));

  let cancelled = false;
  const oversized = createTavilyClient({
    getApiKey: () => apiKey,
    fetch: async () => ({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => ({ done: false, value: new Uint8Array(2 * 1024 * 1024 + 1) }),
          cancel: async () => { cancelled = true; },
        }),
      },
    }),
  });
  await assert.rejects(oversized.request("search", { query: "oversized response" }), error => error.status === "response");
  assert.equal(cancelled, true);
});

test("public URL validation rejects local, numeric, credentialed, signed, and non-HTTPS destinations", () => {
  assert.equal(publicWebUrl("https://docs.example.com/path#fragment"), "https://docs.example.com/path");
  for (const url of [
    "http://docs.example.com/page",
    "https://localhost/page",
    "https://service.local/page",
    "https://127.0.0.1/page",
    "https://[::1]/page",
    "https://user:password@docs.example.com/page",
    "https://docs.example.com:8443/page",
    "https://docs.example.com/page?api_key=secret",
    "https://docs.example.com/page?signature=signed",
  ]) assert.throws(() => publicWebUrl(url), /public HTTPS|credential-bearing/i, url);
});

test("search domain filters are bounded plain public hostnames", () => {
  assert.deepEqual(prepareWebRequest("search", { query: "domain filter", domains: ["docs.example.com", "example.org"] }).include_domains, ["docs.example.com", "example.org"]);
  assert.equal("include_domains" in prepareWebRequest("search", { query: "without domains" }), false);
  assert.throws(() => prepareWebRequest("search", { query: "too many domains", domains: Array.from({ length: 6 }, (_, index) => `d${index}.example`) }), /at most five/);
  for (const domain of ["https://docs.example.com", "docs.example.com/path", "localhost", "127.0.0.1", "user:pass@docs.example.com"]) {
    assert.throws(() => prepareWebRequest("search", { query: "invalid domain", domains: [domain] }), /plain public hostnames|public HTTPS/i, domain);
  }
});

test("web policy is local-only only when explicitly requested, not for a generic offline deliverable", () => {
  for (const request of ["Task --local-only", "Task --no-web", "Do not use the web", "Use only the provided files"]) assert.equal(webPolicy(request), "local-only", request);
  assert.equal(webPolicy("Create an offline deliverable after public research"), "tavily");
  assert.match(webResearchContext(activeWorkflow()), /offline deliverable does not itself prohibit public research/);
});

test("each research pass caps search and read requests independently at three", () => {
  assert.equal(WEB_LIMIT, 3);
  for (const kind of ["search", "read"]) {
    const params = kind === "search" ? { query: "bounded request count" } : { urls: [sourceUrl] };
    const search = receipt("search", "ok", 1, [{ url: sourceUrl }]);
    const prior = Array.from({ length: WEB_LIMIT }, () => receipt(kind, "error", 1));
    assert.throws(() => requireWebAccess(activeWorkflow({ webEvidence: kind === "read" ? [search, ...prior] : prior }), kind, params), /used its 3/);
    assert.doesNotThrow(() => requireWebAccess(activeWorkflow({ researchPass: 2, webEvidence: prior }), "search", { query: "new pass request" }));
  }
});

test("reads must use a URL from a successful search in the current pass", () => {
  const params = { urls: [sourceUrl] };
  assert.throws(() => requireWebAccess(activeWorkflow(), "read", params), /successful Tavily search/);
  assert.throws(() => requireWebAccess(activeWorkflow({ webEvidence: [receipt("search", "error", 1, [{ url: sourceUrl }])] }), "read", params), /successful Tavily search/);
  assert.throws(() => requireWebAccess(activeWorkflow({ researchPass: 2, webEvidence: [receipt("search", "ok", 1, [{ url: sourceUrl }])] }), "read", params), /this research pass/i);
  assert.doesNotThrow(() => requireWebAccess(activeWorkflow({ webEvidence: [receipt("search", "ok", 1, [{ url: sourceUrl }])] }), "read", params));
});

test("handoff requires current-pass successful search, successful read, and an actual Evidence citation", () => {
  const search = receipt("search", "ok", 1, [{ url: sourceUrl, content: "snippet" }]);
  const read = receipt("read", "ok", 1, [{ url: sourceUrl, requestedUrl: sourceUrl, content: "full source" }]);
  const report = `# Research\n## Evidence\nFinding supported by ${sourceUrl}.\n## Caveats\nNone.\n`;

  assert.throws(() => validateWebEvidence(activeWorkflow({ webEvidence: [search] }), report), /successful solar_web_search and solar_web_read/);
  assert.throws(() => validateWebEvidence(activeWorkflow({ webEvidence: [search, receipt("read", "error", 1, read.results)] }), report), /successful solar_web_search and solar_web_read/);
  assert.throws(() => validateWebEvidence(activeWorkflow({ webEvidence: [search, read] }), "# Research\n## Evidence\nUncited finding.\n"), /Cite at least one actually read/);
  assert.doesNotThrow(() => validateWebEvidence(activeWorkflow({ webEvidence: [search, read] }), report));
  assert.throws(() => validateWebEvidence(activeWorkflow({ researchPass: 2, webEvidence: [search, read] }), report), /THIS research pass/);
  assert.doesNotThrow(() => validateWebEvidence(activeWorkflow({ webPolicy: "local-only" }), "# Research\n## Evidence\nLocal evidence only.\n"));
});

test("single-page extraction maps redirected results back to the requested URL", async () => {
  const requestedUrl = "https://origin.example/article";
  const redirectedUrl = "https://canonical.example/article";
  const client = createTavilyClient({
    getApiKey: () => apiKey,
    fetch: async () => jsonResponse({ results: [{ url: redirectedUrl, raw_content: "canonical content" }] }),
  });

  const result = await client.request("read", { urls: [requestedUrl] });
  assert.deepEqual(result.results[0], {
    url: redirectedUrl,
    requestedUrl,
    title: "",
    content: "canonical content",
    truncated: false,
  });
  const workflow = activeWorkflow({
    webEvidence: [
      receipt("search", "ok", 1, [{ url: requestedUrl }]),
      receipt("read", "ok", 1, result.results),
    ],
  });
  assert.doesNotThrow(() => validateWebEvidence(workflow, `# Research\n## Evidence\nRead evidence: ${redirectedUrl}\n`));
});

test("signed and credential-bearing URLs are rejected even in ordinary query values", () => {
  for (const suffix of ["?sig=signature", "?sas=signature", "?key=secret", "?next=sk-private", "?next=Bearer%20secret", "/tvly-private"]) {
    assert.throws(() => publicWebUrl(`https://docs.example.org/source${suffix}`), /credential-bearing/);
  }
});

test("citation provenance uses exact URLs, not a matching URL prefix", () => {
  const workflow = activeWorkflow({ webEvidence: [receipt("search", "ok", 1, [{url:sourceUrl}]), receipt("read", "ok", 1, [{url:sourceUrl,content:"Verified content"}])] });
  assert.throws(() => validateWebEvidence(workflow, `## Evidence\n[Claim](${sourceUrl}-fabricated)`), /Cite at least one actually read/);
  assert.doesNotThrow(() => validateWebEvidence(workflow, `## Evidence\n[Claim](${sourceUrl}#section)`));
});

test("batch canonical URLs report missing provenance rather than guessing association", async () => {
  const canonical = "https://canonical.example.org/article";
  const client = createTavilyClient({getApiKey:()=>apiKey,fetch:async()=>jsonResponse({results:[{url:canonical,raw_content:"Read content"}]})});
  const result = await client.request("read", {urls:[sourceUrl,"https://origin.example.org/other"]});
  assert.equal(result.results[0].requestedUrl, undefined);
  assert.match(result.failures[0].error, /Read the relevant searched URL alone/);
});
