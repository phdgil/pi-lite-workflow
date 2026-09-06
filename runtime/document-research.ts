import { lookup } from "node:dns";
import { request as httpsRequest } from "node:https";
import { createHash } from "node:crypto";
import { publicWebUrl, prepareWebRequest, WEB_NOTICE } from "./web-research.ts";

export const DOCUMENT_BYTES = 10 * 1024 * 1024;
export const PARTITION_URL = "https://api.unstructuredapp.io/general/v0/general";
const FILE_TYPES = {
  ".pdf": "application/pdf", ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".odt": "application/vnd.oasis.opendocument.text", ".rtf": "application/rtf",
};

function failure(message, status = "document") { return Object.assign(new Error(message), { status }); }

export function partitionEndpoint(value = PARTITION_URL) {
  let url;
  try { url = new URL(value); } catch { throw failure("Set UNSTRUCTURED_API_URL to your account's HTTPS direct Partition endpoint, not the Pipelines base URL.", "configuration"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || !/(?:^|\.)unstructured(?:app)?\.io$/.test(url.hostname) || !/^\/general\/v0\/general\/?$/.test(url.pathname)) throw failure("UNSTRUCTURED_API_URL must be an Unstructured HTTPS /general/v0/general endpoint without credentials or query parameters. Pipelines URLs are not compatible.", "configuration");
  return url.href;
}

export function isPublicIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second, third] = parts;
  return !(first === 0 || first === 10 || first === 127 || first >= 224 || (first === 100 && second >= 64 && second <= 127) || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && (second === 168 || (second === 0 && [0, 2].includes(third)))) || (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) || (first === 203 && second === 0 && third === 113));
}

export function publicLookup(hostname, options, callback) {
  lookup(hostname, { all: true, family: 4 }, (error, addresses) => {
    if (error || !addresses.length || addresses.some(item => !isPublicIpv4(item.address))) return callback(failure("Document hostname must resolve only to public IPv4 addresses; local/private destinations are blocked."));
    if (options?.all) callback(null, [addresses[0]]);
    else callback(null, addresses[0].address, 4);
  });
}

export async function downloadPublicDocument(value, signal, redirects = 0) {
  const url = publicWebUrl(value);
  if (signal?.aborted) throw failure("Document retrieval cancelled.", "aborted");
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, { method: "GET", lookup: publicLookup, agent: false, signal, headers: { Accept: Object.values(FILE_TYPES).join(", "), "Accept-Encoding": "identity" } }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.destroy();
        if (redirects >= 3 || !response.headers.location) return reject(failure("Document redirect limit reached or location missing."));
        let destination;
        try { destination = publicWebUrl(new URL(response.headers.location, url).href); } catch { return reject(failure("Document redirect points to an unauthorized source.")); }
        resolve(downloadPublicDocument(destination, signal, redirects + 1));
        return;
      }
      if (response.statusCode !== 200 || Number(response.headers["content-length"] ?? 0) > DOCUMENT_BYTES || (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity")) {
        response.destroy();
        return reject(failure("Document retrieval failed, was compressed, or exceeded the 10 MiB application bound. No file was uploaded."));
      }
      const chunks = [];
      let length = 0;
      response.on("data", chunk => {
        length += chunk.length;
        if (length > DOCUMENT_BYTES) {
          response.destroy();
          reject(failure("Document exceeds the 10 MiB application bound. No file was uploaded."));
        } else chunks.push(chunk);
      });
      response.on("end", () => resolve({ bytes: Buffer.concat(chunks), url, contentType: String(response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase() }));
      response.on("error", () => reject(failure("Document transfer interrupted. No file was uploaded.")));
    });
    request.on("error", () => reject(failure(signal?.aborted ? "Document retrieval cancelled or timed out." : "Document retrieval failed or its network destination was blocked.", signal?.aborted ? "aborted" : "connection")));
    request.end();
  });
}

export function documentFormat(url, contentType, bytes) {
  const pathname = new URL(url).pathname.toLowerCase();
  const extension = Object.keys(FILE_TYPES).find(suffix => pathname.endsWith(suffix)) ?? Object.keys(FILE_TYPES).find(suffix => FILE_TYPES[suffix] === contentType);
  if (!extension || contentType === "text/html" || !bytes.length || bytes.length > DOCUMENT_BYTES) throw failure("Use a public PDF, DOC/DOCX, PPTX, XLSX, ODT, or RTF document within 10 MiB. Read HTML pages with solar_web_read instead.");
  if (extension === ".pdf" && !bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw failure("The retrieved source is not a PDF document. Search for the direct document URL.");
  return { filename: `source${extension}`, type: FILE_TYPES[extension], extension };
}

async function partitionJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw failure("Unstructured returned no document elements.", "response");
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > 2 * 1024 * 1024) throw new Error("Response bound exceeded");
      chunks.push(chunk.value);
    }
    const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!Array.isArray(result)) throw new Error("Expected document elements");
    return result;
  } catch { throw failure("Unstructured returned unreadable, oversized, or interrupted document elements.", "response"); }
  finally { await reader.cancel().catch(() => {}); }
}

export function createDocumentClient({ fetch: fetcher = (...args) => globalThis.fetch(...args), download = downloadPublicDocument, getApiKey = () => process.env.UNSTRUCTURED_API_KEY, getApiUrl = () => process.env.UNSTRUCTURED_API_URL, timeoutMs = 120000 } = {}) {
  return {
    configured: () => Boolean(getApiKey()?.trim()),
    async request(_kind, params, signal) {
      const input = prepareWebRequest("document", params);
      const key = getApiKey()?.trim();
      if (!key) throw failure("UNSTRUCTURED_API_KEY is missing from this pi process. Set it privately and restart pi; never paste it in chat.", "missing_key");
      const endpoint = partitionEndpoint(getApiUrl()?.trim() || PARTITION_URL);
      if (input.url.includes(key)) throw failure("Do not send credentials in document source URLs.", "private_input");
      const timeout = AbortSignal.timeout(timeoutMs);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const source = await download(input.url, combined);
      const sourceUrl = publicWebUrl(source.url);
      if (sourceUrl.includes(key)) throw failure("Credential-bearing document source rejected.", "private_input");
      const format = documentFormat(sourceUrl, source.contentType, source.bytes);
      const form = new FormData();
      form.append("files", new Blob([source.bytes], { type: format.type }), format.filename);
      if (format.extension === ".pdf") form.append("strategy", input.strategy);
      let response;
      try {
        response = await fetcher(endpoint, { method: "POST", redirect: "error", headers: { accept: "application/json", "unstructured-api-key": key }, body: form, signal: combined });
      } catch { throw failure(combined.aborted ? "Document partition cancelled or timed out; no successful evidence recorded." : "Unstructured connection failed. No automatic charged retry was attempted.", combined.aborted ? "aborted" : "connection"); }
      if (!response.ok) {
        const retry = response.headers.get("retry-after");
        const delay = retry && /^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : 60000;
        await response.body?.cancel().catch(() => {});
        const error = failure(`Unstructured partition failed (HTTP ${response.status}). ${[401, 403, 404].includes(response.status) ? "Check the API key and account's direct Partition endpoint." : "No successful evidence or automatic retry recorded."}`, response.status);
        if (response.status === 429) Object.assign(error, { retryAfterMs: Number.isFinite(delay) ? Math.max(1000, delay) : 60000 });
        throw error;
      }
      const raw = await partitionJson(response);
      const clean = (value, limit) => (typeof value === "string" ? value : "").split(key).join("[REDACTED]").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").slice(0, limit);
      const elements = [];
      let remaining = 24000;
      let truncated = false;
      for (const item of raw) {
        if (!item || typeof item.text !== "string" || !item.text.trim()) continue;
        if (!remaining || elements.length >= 120) { truncated = true; break; }
        const text = clean(item.text, Math.min(4000, remaining));
        remaining -= text.length;
        const tableHtml = clean(item.metadata?.text_as_html, Math.min(4000, remaining));
        remaining -= tableHtml.length;
        truncated ||= item.text.length > text.length || (item.metadata?.text_as_html?.length ?? 0) > tableHtml.length;
        elements.push({ type: clean(item.type, 60), text, ...(Number.isInteger(item.metadata?.page_number) ? { page: item.metadata.page_number } : {}), ...(tableHtml ? { tableHtml } : {}) });
      }
      const content = elements.map(item => `${item.page ? `[page ${item.page}] ` : ""}${item.text}`).join("\n\n");
      return { notice: WEB_NOTICE, kind: "document", urls: [input.url], results: content ? [{ url: sourceUrl, requestedUrl: input.url, content, elements, truncated, strategy: format.extension === ".pdf" ? input.strategy : "auto", bytes: source.bytes.length, sha256: createHash("sha256").update(source.bytes).digest("hex") }] : [], failures: content ? [] : [{ url: input.url, error: "No readable text returned. A scanned PDF may need strategy hi_res; do not claim it was read." }], retrievedAt: new Date().toISOString() };
    },
  };
}
