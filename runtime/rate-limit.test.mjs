import assert from "node:assert/strict";
import test from "node:test";

import { createRetryingFetch } from "./retry-fetch.ts";

const URL = "https://api.upstage.ai/v1/chat/completions";

function request(body = { model: "solar-pro4", messages: [{ role: "user", content: "hello" }] }, extra = {}) {
  return [URL, { method: "POST", body: JSON.stringify(body), ...extra }];
}

function response(status = 200, headers = {}) {
  return { status, headers: new Headers(headers) };
}

function clock(start = 1_700_000_000_000) {
  let current = start;
  const waits = [];
  return {
    now: () => current,
    sleep: async (delayMs) => {
      waits.push(delayMs);
      current += delayMs;
    },
    waits,
    advance: (delayMs) => { current += delayMs; },
  };
}

test("default match leaves unrelated providers and models untouched", async () => {
  const calls = [];
  const baseFetch = async (...args) => {
    calls.push(args);
    return response();
  };
  const limited = createRetryingFetch(baseFetch);
  const otherUrl = "https://example.com/v1/chat/completions";
  const otherInit = { body: JSON.stringify({ model: "solar-pro4" }) };
  const otherModel = request({ model: "lite-pro3" });

  await limited(otherUrl, otherInit);
  await limited(...otherModel);

  assert.deepEqual(calls, [[otherUrl, otherInit], otherModel]);
  assert.equal(limited.snapshot().mode, "retry-only");
});

test("a Request body is inspected without consuming or reconstructing it", async () => {
  const seen = [];
  const input = new Request(URL, {
    method: "POST",
    body: JSON.stringify({ model: "solar-pro4", messages: [] }),
  });
  const limited = createRetryingFetch(async (actual) => {
    seen.push(actual);
    return response();
  }, {  });

  await limited(input);

  assert.equal(seen[0], input);
  assert.equal(input.bodyUsed, false);
  assert.equal(limited.snapshot().attempt, 1);
});

test("Retry-After duration and Upstage UNIX timestamps are distinguished and maximized", async () => {
  const time = clock();
  let calls = 0;
  const limited = createRetryingFetch(async () => {
    calls += 1;
    if (calls === 1) {
      return response(429, {
        "retry-after": "2",
        "x-upstage-ratelimit-retry-after-requests": String((time.now() + 5_000) / 1000),
        "x-upstage-ratelimit-retry-after-tokens": String((time.now() + 3_000) / 1000),
      });
    }
    return response();
  }, { now: time.now, sleep: time.sleep, random: () => 0 });

  const result = await limited(...request());

  assert.equal(result.status, 200);
  assert.equal(calls, 2);
  assert.deepEqual(time.waits, [5_000]);
});

test("standard Retry-After HTTP date is honored", async () => {
  const time = clock();
  let calls = 0;
  const limited = createRetryingFetch(async () => {
    calls += 1;
    return calls === 1
      ? response(429, { "retry-after": new Date(time.now() + 4_000).toUTCString() })
      : response();
  }, { now: time.now, sleep: time.sleep, random: () => 0 });

  await limited(...request());
  assert.deepEqual(time.waits, [4_000]);
});

test("maximum of both Upstage retry timestamps controls 429 recovery", async () => {
  const time = clock();
  let calls = 0;
  const limited = createRetryingFetch(async () => {
    calls += 1;
    return calls === 1
      ? response(429, {
        "x-upstage-ratelimit-retry-after-requests": String((time.now() + 7_000) / 1000),
        "x-upstage-ratelimit-retry-after-tokens": String((time.now() + 9_000) / 1000),
      })
      : response();
  }, { now: time.now, sleep: time.sleep, random: () => 0 });

  await limited(...request());
  assert.deepEqual(time.waits, [9_000]);
});

test("abort is honored during an injected wait", async () => {
  const controller = new AbortController();
  let calls = 0;
  const limited = createRetryingFetch(async () => {
    calls += 1;
    return response(429, { "retry-after": "1" });
  }, {
    sleep: async () => new Promise(() => {}),
  });

  const pending = limited(...request(undefined, { signal: controller.signal }));
  setImmediate(() => controller.abort());

  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(calls, 1);
});

test("429 retry reuses the identical body and does not alter request fields", async () => {
  const time = clock();
  const bodies = [];
  let calls = 0;
  const limited = createRetryingFetch(async (_url, init) => {
    calls += 1;
    bodies.push(init.body);
    return calls === 1 ? response(429, { "retry-after": "1" }) : response();
  }, { now: time.now, sleep: time.sleep, random: () => 0 });
  const payload = {
    model: "solar-pro4",
    max_tokens: 8_192,
    reasoning_effort: "max",
    messages: [{ role: "user", content: "unchanged" }],
  };
  const args = request(payload);

  await limited(...args);

  assert.equal(calls, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(bodies[0], args[1].body);
  assert.deepEqual(JSON.parse(bodies[0]), payload);
});

test("each retried 429 body is closed while the final response body stays untouched", async () => {
  const time = clock();
  const replies = [
    new Response("first limit", { status: 429, headers: { "retry-after": "1" } }),
    new Response("second limit", { status: 429, headers: { "retry-after": "1" } }),
    new Response("success", { status: 200 }),
  ];
  let calls = 0;
  const limited = createRetryingFetch(async () => replies[calls++], {
    now: time.now,
    sleep: time.sleep,
    random: () => 0,
  });

  const result = await limited(...request());

  assert.equal(result, replies[2]);
  assert.equal(replies[0].bodyUsed, true);
  assert.equal(replies[1].bodyUsed, true);
  assert.equal(replies[2].bodyUsed, false);
  assert.equal(await result.text(), "success");
});

test("exhausted 429 and non-429 bodies remain available to the SDK", async (context) => {
  await context.test("exhausted 429", async () => {
    const expected = new Response("limit details", { status: 429 });
    const limited = createRetryingFetch(async () => expected, { maxRetries: 0 });

    const result = await limited(...request());
    assert.equal(result, expected);
    assert.equal(result.bodyUsed, false);
    assert.equal(await result.text(), "limit details");
  });

  await context.test("non-429", async () => {
    const expected = new Response("bad request details", { status: 400 });
    const limited = createRetryingFetch(async () => expected, {  });

    const result = await limited(...request());
    assert.equal(result, expected);
    assert.equal(result.bodyUsed, false);
    assert.equal(await result.text(), "bad request details");
  });
});

test("400 and 401 responses pass through without retry", async (context) => {
  for (const status of [400, 401]) {
    await context.test(String(status), async () => {
      let calls = 0;
      const expected = response(status);
      const limited = createRetryingFetch(async () => {
        calls += 1;
        return expected;
      }, {  });

      assert.equal(await limited(...request()), expected);
      assert.equal(calls, 1);
    });
  }
});

test("retry count and cumulative retry waiting are bounded", async (context) => {
  await context.test("maxRetries", async () => {
    const time = clock();
    let calls = 0;
    const limited = createRetryingFetch(async () => {
      calls += 1;
      return response(429, { "retry-after": "1" });
    }, { now: time.now, sleep: time.sleep, random: () => 0, maxRetries: 2 });

    const result = await limited(...request());
    assert.equal(result.status, 429);
    assert.equal(calls, 3);
    assert.deepEqual(time.waits, [1_000, 1_000]);
  });

  await context.test("maxWaitMs", async () => {
    const time = clock();
    let calls = 0;
    const limited = createRetryingFetch(async () => {
      calls += 1;
      return response(429, { "retry-after": "10" });
    }, { now: time.now, sleep: time.sleep, random: () => 0, maxWaitMs: 5_000 });

    const result = await limited(...request());
    assert.equal(result.status, 429);
    assert.equal(calls, 1);
    assert.deepEqual(time.waits, []);
  });
});

test("fallback retry is exponential from at least sixty seconds", async () => {
  const time = clock();
  let calls = 0;
  const limited = createRetryingFetch(async () => {
    calls += 1;
    return calls < 3 ? response(429) : response();
  }, {
    now: time.now,
    sleep: time.sleep,
    random: () => 0,
    maxWaitMs: 180_000,
  });

  const result = await limited(...request());
  assert.equal(result.status, 200);
  assert.deepEqual(time.waits, [60_000, 120_000]);
});

test("network failures are never retried", async () => {
  let calls = 0;
  const expected = new Error("socket closed");
  const limited = createRetryingFetch(async () => {
    calls += 1;
    throw expected;
  }, {  });

  await assert.rejects(limited(...request()), expected);
  assert.equal(calls, 1);
});
