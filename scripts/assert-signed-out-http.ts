import assert from "node:assert/strict";

const DIRECTORY_MARKERS = [
  "24/7 Express Logistics",
  "J Kings Holtsville",
  "Pike Osborne",
  "Heartland Foods",
];

const USER_TREE =
  "%5B%22%22%2C%7B%22children%22%3A%5B%22login%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%2Ctrue%5D";

const NEXT16_TREE = encodeURIComponent(
  JSON.stringify(["", { children: ["login", { children: ["__PAGE__", {}, null, null, 4096] }, null, null, 4096] }, null, null, 4112]),
);

export async function runSignedOutHttpAsserts(origin: string): Promise<void> {
  const root = await fetch(origin + "/", { redirect: "manual" });
  assert.equal(root.status, 307, `signed-out / must 307, got ${root.status}`);
  const location = root.headers.get("location") ?? "";
  assert.match(location, /\/login$/, `signed-out / must send the browser to /login, got ${location}`);
  const rootBody = await root.text();
  assert.ok(rootBody.length < 2000, `signed-out / body should stay tiny, got ${rootBody.length}`);
  for (const marker of DIRECTORY_MARKERS) {
    assert.doesNotMatch(rootBody, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const login = await fetch(origin + "/login", { redirect: "manual" });
  assert.equal(login.status, 200, `/login document must be 200, got ${login.status}`);
  const loginBody = await login.text();
  assert.match(loginBody, /Dispatcher desk/);
  assert.ok(loginBody.length < 80_000, `/login document should stay small, got ${loginBody.length}`);
  for (const marker of DIRECTORY_MARKERS) {
    assert.doesNotMatch(loginBody, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const [label, tree] of [
    ["chrome-legacy-true", USER_TREE],
    ["next16", NEXT16_TREE],
  ] as const) {
    const rsc = await fetch(origin + "/login", {
      redirect: "follow",
      headers: {
        RSC: "1",
        "Next-Router-State-Tree": tree,
      },
    });
    assert.notEqual(rsc.status, 500, `/login RSC (${label}) must not 500, got ${rsc.status}`);
    assert.ok(rsc.status >= 200 && rsc.status < 400, `/login RSC (${label}) unexpected ${rsc.status}`);
    const rscBody = await rsc.text();
    assert.doesNotMatch(rscBody, /Internal Server Error/);
    assert.ok(rscBody.length < 80_000, `/login RSC (${label}) should stay small, got ${rscBody.length}`);
    for (const marker of DIRECTORY_MARKERS) {
      assert.doesNotMatch(rscBody, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("assert-signed-out-http.ts")) {
  const origin = process.argv[2] || process.env.TMS_HTTP_ORIGIN || "http://127.0.0.1:3000";
  runSignedOutHttpAsserts(origin)
    .then(() => {
      console.log(`Signed-out HTTP asserts passed against ${origin}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
