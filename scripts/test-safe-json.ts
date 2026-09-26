// Test that safeJson handles empty/error responses gracefully.
// We simulate the failure modes that caused "Unexpected end of JSON input":
//   1. Empty 200 response body
//   2. 500 response with empty body
//   3. 500 response with HTML body (e.g. dev server error page)
//   4. Network error (fetch to non-existent endpoint)
//
// We use the safeJson helper directly to verify it returns {code: 500}
// instead of throwing.

const { safeJson } = await import("../src/lib/utils");

async function test(name: string, fn: () => Promise<Response>) {
  try {
    const res = await fn();
    const json = await safeJson(res, "test fallback");
    console.log(`[${name}] code=${json.code} message=${json.message || "(none)"}`);
    if (json.code === 0) {
      console.log(`  ✓ Would NOT throw — returns code=0`);
    } else {
      console.log(`  ✓ Would NOT throw — returns code=${json.code} (UI shows error gracefully)`);
    }
  } catch (e) {
    console.log(`[${name}] ✗ THREW: ${(e as Error).message}`);
  }
}

// 1. Mock empty 200 body
const emptyOk = new Response("", { status: 200, headers: { "content-type": "application/json" } });
await test("empty 200 body", async () => emptyOk);

// 2. Mock 500 with empty body
const empty500 = new Response("", { status: 500 });
await test("500 empty body", async () => empty500);

// 3. Mock 500 with HTML body
const html500 = new Response("<html><body>Internal Server Error</body></html>", {
  status: 500,
  headers: { "content-type": "text/html" },
});
await test("500 HTML body", async () => html500);

// 4. Mock 500 with valid JSON error
const json500 = new Response(JSON.stringify({ code: 500, message: "MovieBox API error" }), {
  status: 500,
  headers: { "content-type": "application/json" },
});
await test("500 JSON body", async () => json500);

// 5. Mock valid JSON success
const ok200 = new Response(JSON.stringify({ code: 0, message: "ok", data: { foo: "bar" } }), {
  status: 200,
  headers: { "content-type": "application/json" },
});
await test("valid 200 JSON", async () => ok200);

// 6. Mock 200 with invalid JSON (truncated)
const badJson = new Response('{"code":0,"data":{"foo":', {
  status: 200,
  headers: { "content-type": "application/json" },
});
await test("200 invalid JSON", async () => badJson);

console.log("\n=== All tests done — none should say ✗ THREW ===");
