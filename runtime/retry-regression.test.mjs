import assert from "node:assert/strict";
import test from "node:test";
import { createRetryingFetch } from "./retry-fetch.ts";

const endpoint = "https://api.upstage.ai/v1/chat/completions";

test("large Solar Max requests reach the provider unchanged without a local cap", async () => {
  const body = JSON.stringify({ model: "solar-pro4", reasoning_effort: "max", max_tokens: 32768, messages: [{ role: "user", content: "context ".repeat(30000) }] });
  const init = { method: "POST", body };
  const calls = [];
  const fetch = createRetryingFetch(async (...args) => {
    calls.push(args);
    return new Response("ok");
  });
  assert.equal((await fetch(endpoint, init)).status, 200);
  assert.deepEqual(calls, [[endpoint, init]]);
});

test("successful requests never wait on local budgets or remaining-token estimates", async () => {
  let current = 1700000000000;
  const waits = [];
  const fetch = createRetryingFetch(async () => new Response("ok", { headers: {
    "x-upstage-ratelimit-remaining-tokens": "-1",
    "x-upstage-ratelimit-reset-tokens": String((current + 60000) / 1000),
  } }), { now: () => current, sleep: async delay => { waits.push(delay); current += delay; },
    initialState: { requests: [{ timestamp: current, estimatedTokens: 1000000 }], cooldown: { tokensUntil: current + 60000 } } });
  const init = { method: "POST", body: JSON.stringify({ model: "solar-pro4", messages: [] }) };
  for (let index = 0; index < 100; index += 1) assert.equal((await fetch(endpoint, init)).status, 200);
  assert.deepEqual(waits, []);
});

test("a slow successful request does not consume the 429 waiting budget", async () => {
  let current = 0;
  let calls = 0;
  const waits = [];
  const fetch = createRetryingFetch(async () => {
    calls += 1;
    current += 900000;
    return calls === 1 ? new Response("busy", { status: 429, headers: { "retry-after": "1" } }) : new Response("ok");
  }, { now: () => current, random: () => 0, maxWaitMs: 1000, sleep: async delay => { waits.push(delay); current += delay; } });
  assert.equal((await fetch(endpoint, { body: JSON.stringify({ model: "solar-pro4" }) })).status, 200);
  assert.deepEqual(waits, [1000]);
});

test("all default retries are available without a three-minute cutoff", async () => {
  let current = 0;
  let calls = 0;
  const waits = [];
  const fetch = createRetryingFetch(async () => {
    calls += 1;
    return new Response("busy", { status: 429 });
  }, { now: () => current, random: () => 0, sleep: async delay => { waits.push(delay); current += delay; } });
  const final = await fetch(endpoint, { body: JSON.stringify({ model: "solar-pro4" }) });
  assert.equal(await final.text(), "busy");
  assert.equal(calls, 6);
  assert.deepEqual(waits, [60000, 120000, 240000, 300000, 300000]);
});
