import assert from "node:assert/strict";
import test from "node:test";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import { EventEmitter } from "node:events";
import {
  DOCUMENT_BYTES,
  PARTITION_URL,
  createDocumentClient,
  documentFormat,
  downloadPublicDocument,
  isPublicIpv4,
  partitionEndpoint,
} from "./document-research.ts";
import { prepareWebRequest, requireWebAccess, validateWebEvidence } from "./web-research.ts";

const apiKey = "document-unit-test-secret";

test("document redirects destroy their response body before following the next URL", async context => {
  const destroyed = [];
  const calls = [];
  const stub = context.mock.method(https, "request", (url, _options, receive) => {
    calls.push(url);
    const request = new EventEmitter();
    request.end = () => {
      const response = new EventEmitter();
      response.statusCode = calls.length === 1 ? 302 : 200;
      response.headers = response.statusCode === 302 ? {location:"https://docs.example.org/final.pdf"} : {"content-type":"application/pdf"};
      response.destroy = () => destroyed.push(url);
      receive(response);
      if (response.statusCode === 200) {
        response.emit("data", Buffer.from("%PDF-1.7 fixture"));
        response.emit("end");
      }
    };
    return request;
  });
  syncBuiltinESMExports();
  try {
    const result = await downloadPublicDocument("https://docs.example.org/origin.pdf");
    assert.deepEqual(destroyed, ["https://docs.example.org/origin.pdf"]);
    assert.equal(calls.length, 2);
    assert.equal(result.url, "https://docs.example.org/final.pdf");
  } finally { stub.mock.restore(); syncBuiltinESMExports(); }
});
const pdfUrl = "https://docs.example.com/report.pdf";
const docxUrl = "https://docs.example.com/report.docx";
const pdfBytes = Buffer.from("%PDF-1.7\nunit test document");

function documentResponse(elements, init = {}) {
  return new Response(JSON.stringify(elements), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

function source(url = pdfUrl, bytes = pdfBytes, contentType = "application/pdf") {
  return { url, bytes, contentType };
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

test("PDF upload uses native FormData, only the API key auth header, and fast strategy", async () => {
  let observed;
  let downloadArguments;
  const client = createDocumentClient({
    getApiKey: () => `  ${apiKey}  `,
    getApiUrl: () => "",
    download: async (...args) => {
      downloadArguments = args;
      return source();
    },
    fetch: async (url, init) => {
      observed = { url, init };
      return documentResponse([{ type: "NarrativeText", text: "Evidence", metadata: { page_number: 1 } }]);
    },
  });

  const result = await client.request("document", { url: pdfUrl });
  assert.equal(client.configured(), true);
  assert.equal(observed.url, PARTITION_URL);
  assert.equal(observed.init.method, "POST");
  assert.equal(observed.init.redirect, "error");
  assert.deepEqual(observed.init.headers, { accept: "application/json", "unstructured-api-key": apiKey });
  assert.equal(Object.keys(observed.init.headers).some(name => name.toLowerCase() === "content-type"), false);
  assert.ok(observed.init.body instanceof FormData);
  assert.deepEqual([...observed.init.body.keys()], ["files", "strategy"]);
  assert.equal(observed.init.body.get("strategy"), "fast");
  const file = observed.init.body.get("files");
  assert.equal(file.name, "source.pdf");
  assert.equal(file.type, "application/pdf");
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), pdfBytes);
  assert.equal(downloadArguments.length, 2);
  assert.equal(downloadArguments[0], pdfUrl);
  assert.ok(downloadArguments[1] instanceof AbortSignal);
  assert.equal(JSON.stringify(downloadArguments).includes(apiKey), false);
  assert.equal(result.results[0].strategy, "fast");
});

test("PDF hi_res is forwarded while DOCX omits strategy and reports auto", async () => {
  const forms = [];
  const downloads = [
    source(pdfUrl, pdfBytes, "application/pdf"),
    source(docxUrl, Buffer.from("docx fixture"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
  ];
  const client = createDocumentClient({
    getApiKey: () => apiKey,
    download: async () => downloads.shift(),
    fetch: async (_url, init) => {
      forms.push(init.body);
      return documentResponse([{ type: "Title", text: "Readable" }]);
    },
  });

  const pdf = await client.request("document", { url: pdfUrl, strategy: "hi_res" });
  const docx = await client.request("document", { url: docxUrl, strategy: "hi_res" });
  assert.equal(forms[0].get("strategy"), "hi_res");
  assert.deepEqual([...forms[1].keys()], ["files"]);
  assert.equal(forms[1].get("strategy"), null);
  assert.equal(forms[1].get("files").name, "source.docx");
  assert.equal(pdf.results[0].strategy, "hi_res");
  assert.equal(docx.results[0].strategy, "auto");
});

test("custom endpoints reject pipelines, non-HTTPS, foreign hosts, and query parameters", () => {
  assert.equal(partitionEndpoint("https://api.unstructuredapp.io/general/v0/general"), PARTITION_URL);
  assert.equal(partitionEndpoint("https://api.unstructured.io/general/v0/general/"), "https://api.unstructured.io/general/v0/general/");
  for (const endpoint of [
    "https://api.unstructuredapp.io/pipelines/v1/pipelines",
    "http://api.unstructuredapp.io/general/v0/general",
    "https://example.com/general/v0/general",
    "https://api.unstructuredapp.io/general/v0/general?mode=fast",
  ]) assert.throws(() => partitionEndpoint(endpoint), error => error.status === "configuration" && /Partition|Pipelines|HTTPS/.test(error.message), endpoint);
});

test("a missing key fails before endpoint lookup, download, or upload", async () => {
  let apiUrlCalls = 0;
  let downloadCalls = 0;
  let fetchCalls = 0;
  const client = createDocumentClient({
    getApiKey: () => "  ",
    getApiUrl: () => { apiUrlCalls += 1; return "https://invalid.example/pipeline"; },
    download: async () => { downloadCalls += 1; return source(); },
    fetch: async () => { fetchCalls += 1; },
  });

  assert.equal(client.configured(), false);
  await assert.rejects(client.request("document", { url: pdfUrl }), error => error.status === "missing_key" && /never paste/i.test(error.message));
  assert.equal(apiUrlCalls, 0);
  assert.equal(downloadCalls, 0);
  assert.equal(fetchCalls, 0);
});

test("bad document types and oversized files are rejected before upload", async () => {
  assert.throws(() => documentFormat("https://docs.example.com/page.html", "text/html", Buffer.from("<html>")), /public PDF/);
  assert.throws(() => documentFormat(pdfUrl, "application/pdf", Buffer.from("not a pdf")), /not a PDF/);
  assert.throws(() => documentFormat(docxUrl, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", Buffer.alloc(DOCUMENT_BYTES + 1)), /within 10 MiB/);

  let fetchCalls = 0;
  const downloads = [
    source("https://docs.example.com/page.html", Buffer.from("<html>"), "text/html"),
    source(docxUrl, Buffer.alloc(DOCUMENT_BYTES + 1), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
  ];
  const client = createDocumentClient({
    getApiKey: () => apiKey,
    download: async () => downloads.shift(),
    fetch: async () => { fetchCalls += 1; },
  });

  await assert.rejects(client.request("document", { url: "https://docs.example.com/page.html" }), /public PDF/);
  await assert.rejects(client.request("document", { url: docxUrl }), /within 10 MiB/);
  assert.equal(fetchCalls, 0);
});

test("document elements redact secrets and bound text, type, page, table, count, and total content", async () => {
  const elements = Array.from({ length: 125 }, (_, index) => ({
    type: index === 0 ? `${apiKey}-${"T".repeat(80)}` : "NarrativeText",
    text: index === 0 ? `${apiKey}\u0001${"x".repeat(5000)}` : "y".repeat(4000),
    metadata: index === 0
      ? { page_number: 7, text_as_html: `<table>${apiKey}${"z".repeat(5000)}</table>` }
      : { page_number: "8", text_as_html: "" },
  }));
  const client = createDocumentClient({
    getApiKey: () => apiKey,
    download: async () => source(),
    fetch: async () => documentResponse(elements),
  });

  const result = await client.request("document", { url: pdfUrl });
  const evidence = result.results[0];
  assert.equal(JSON.stringify(evidence).includes(apiKey), false);
  assert.equal(evidence.elements[0].type.length, 60);
  assert.equal(evidence.elements[0].text.length, 4000);
  assert.equal(evidence.elements[0].page, 7);
  assert.equal(evidence.elements[0].tableHtml.length, 4000);
  assert.equal("page" in evidence.elements[1], false);
  assert.ok(evidence.elements.length <= 120);
  assert.ok(evidence.elements.reduce((total, item) => total + item.text.length + (item.tableHtml?.length ?? 0), 0) <= 24000);
  assert.equal(evidence.truncated, true);
});

test("empty document text produces a failure and no evidence result", async () => {
  const client = createDocumentClient({
    getApiKey: () => apiKey,
    download: async () => source(),
    fetch: async () => documentResponse([
      { type: "Title", text: "" },
      { type: "NarrativeText", text: "   \n\t", metadata: { text_as_html: "<table>not standalone evidence</table>" } },
      { type: "Image", metadata: { text_as_html: "<table>also ignored</table>" } },
    ]),
  });

  const result = await client.request("document", { url: pdfUrl });
  assert.deepEqual(result.results, []);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].error, /No readable text/);
});

test("401 and 429 bodies are sanitized, cancelled, and never retried", async () => {
  for (const { status, retryAfter, expectedDelay } of [
    { status: 401 },
    { status: 429, retryAfter: "1.5", expectedDelay: 1500 },
  ]) {
    let calls = 0;
    let cancelled = false;
    const client = createDocumentClient({
      getApiKey: () => apiKey,
      download: async () => source(),
      fetch: async () => {
        calls += 1;
        return {
          ok: false,
          status,
          headers: new Headers(retryAfter ? { "retry-after": retryAfter } : {}),
          body: { cancel: async () => { cancelled = true; } },
        };
      },
    });

    await assert.rejects(client.request("document", { url: pdfUrl }), error => {
      assert.equal(error.status, status);
      assert.doesNotMatch(error.message, /provider secret|document-unit-test-secret/i);
      if (status === 401) assert.match(error.message, /API key/);
      if (status === 429) assert.equal(error.retryAfterMs, expectedDelay);
      return true;
    });
    assert.equal(calls, 1);
    assert.equal(cancelled, true);
  }
});

test("external cancellation and timeout abort document partition without retry", async () => {
  let calls = 0;
  const waitForAbort = async (_url, { signal }) => {
    calls += 1;
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason);
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  };
  const controller = new AbortController();
  const cancelledClient = createDocumentClient({ getApiKey: () => apiKey, download: async () => source(), fetch: waitForAbort, timeoutMs: 1000 });
  const cancelled = cancelledClient.request("document", { url: pdfUrl }, controller.signal);
  controller.abort();
  await assert.rejects(cancelled, error => error.status === "aborted" && /cancelled or timed out/.test(error.message));

  const timeoutClient = createDocumentClient({ getApiKey: () => apiKey, download: async () => source(), fetch: waitForAbort, timeoutMs: 5 });
  await assert.rejects(timeoutClient.request("document", { url: pdfUrl }), error => error.status === "aborted" && /timed out/.test(error.message));
  assert.equal(calls, 2);
});

test("invalid and oversized partition JSON fail through the bounded reader", async () => {
  const invalid = createDocumentClient({
    getApiKey: () => apiKey,
    download: async () => source(),
    fetch: async () => new Response("not json"),
  });
  await assert.rejects(invalid.request("document", { url: pdfUrl }), error => error.status === "response" && /unreadable/.test(error.message));

  let cancelled = false;
  const oversized = createDocumentClient({
    getApiKey: () => apiKey,
    download: async () => source(),
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
  await assert.rejects(oversized.request("document", { url: pdfUrl }), error => error.status === "response" && /oversized/.test(error.message));
  assert.equal(cancelled, true);
});

test("public IPv4 screening blocks private, local, shared, documentation, and reserved ranges", () => {
  for (const address of [
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.1.1", "172.16.0.1",
    "172.31.255.255", "192.0.0.1", "192.0.2.1", "192.168.1.1", "198.18.0.1",
    "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255", "999.1.1.1", "1.2.3",
  ]) assert.equal(isPublicIpv4(address), false, address);
  for (const address of ["1.1.1.1", "8.8.8.8", "93.184.216.34"]) assert.equal(isPublicIpv4(address), true, address);
});

test("document evidence gate requires a successful current-pass searched receipt and citation", () => {
  const search = receipt("search", "ok", 2, [{ url: pdfUrl, content: "document result" }]);
  const document = receipt("document", "ok", 2, [{ url: pdfUrl, requestedUrl: pdfUrl, content: "full document text" }]);
  const workflow = activeWorkflow({ researchPass: 2, webEvidence: [search, document] });
  const cited = `# Research\n## Evidence\nThe document supports this finding: ${pdfUrl}\n## Caveats\nNone.\n`;

  assert.doesNotThrow(() => validateWebEvidence(workflow, cited));
  assert.throws(() => validateWebEvidence(workflow, "# Research\n## Evidence\nUncited finding.\n"), /Cite at least one actually read/);
  assert.throws(() => validateWebEvidence(activeWorkflow({ researchPass: 3, webEvidence: [search, document] }), cited), /THIS research pass/);
  assert.throws(() => validateWebEvidence(activeWorkflow({ researchPass: 2, webEvidence: [search, receipt("document", "error", 2, document.results)] }), cited), /successful solar_web_search/);
});

test("document access is capped at two calls and rejects local-only or unsearched URLs", () => {
  const search = receipt("search", "ok", 1, [{ url: pdfUrl }]);
  assert.throws(() => requireWebAccess(activeWorkflow({ webPolicy: "local-only" }), "document", { url: pdfUrl }), /excludes web access/);
  assert.throws(() => requireWebAccess(activeWorkflow(), "document", { url: pdfUrl }), /successful Tavily search/);
  assert.throws(() => requireWebAccess(activeWorkflow({ webEvidence: [receipt("search", "error", 1, [{ url: pdfUrl }])] }), "document", { url: pdfUrl }), /successful Tavily search/);
  assert.throws(() => requireWebAccess(activeWorkflow({ researchPass: 2, webEvidence: [search] }), "document", { url: pdfUrl }), /this research pass/i);
  assert.doesNotThrow(() => requireWebAccess(activeWorkflow({ webEvidence: [search] }), "document", { url: pdfUrl }));
  assert.throws(() => requireWebAccess(activeWorkflow({ webEvidence: [search, receipt("document"), receipt("document", "error")] }), "document", { url: pdfUrl }), /used its 2 document requests/);
});

test("web page reads reject PDF and Office paths in favor of document reading", () => {
  for (const extension of ["pdf", "doc", "docx", "pptx", "xlsx", "odt", "rtf"]) {
    assert.throws(
      () => prepareWebRequest("read", { urls: [`https://docs.example.com/source.${extension}?download=1#page=2`] }),
      /solar_document_read.*PDF\/Office/i,
      extension,
    );
  }
  assert.doesNotThrow(() => prepareWebRequest("read", { urls: ["https://docs.example.com/source.html"] }));
});
