import test from "node:test";
import assert from "node:assert/strict";

import {
  PortalError,
  buildShareUrl,
  extractCamoUrl,
  extractSourceFromLocation,
  normalizeImgurUrl,
  requestCamoUrl,
  validateCamoUrl
} from "../site/app.js";

const SOURCE = "https://i.imgur.com/eScxuDz.jpg";
const SOURCE_HEX = Buffer.from(SOURCE).toString("hex");
const CAMO = `https://camo.githubusercontent.com/${"a".repeat(64)}/${SOURCE_HEX}`;
const RENDERED = `<p><a href="${CAMO}"><img src="${CAMO}" alt="image" data-canonical-src="${SOURCE}" style="max-width: 100%;"></a></p>`;

function assertPortalError(fn, code) {
  assert.throws(fn, (error) => error instanceof PortalError && error.code === code);
}

test("normalizes direct Imgur images and strips query data", () => {
  assert.deepEqual(normalizeImgurUrl(" http://i.imgur.com/eScxuDz.JPG?width=200#x "), {
    sourceUrl: SOURCE,
    id: "eScxuDz",
    extension: "jpg",
    inputUrl: "http://i.imgur.com/eScxuDz.JPG?width=200#x",
    converted: true
  });
});

test("accepts host-only input and simple single-image pages", () => {
  assert.equal(normalizeImgurUrl("imgur.com/eScxuDz").sourceUrl, SOURCE);
  assert.equal(normalizeImgurUrl("https://www.imgur.com/eScxuDz.png").sourceUrl, "https://i.imgur.com/eScxuDz.png");
  assert.equal(normalizeImgurUrl("https://m.imgur.com/download/eScxuDz").sourceUrl, SOURCE);
});

test("maps gifv pages back to an image and preserves actual image formats", () => {
  assert.equal(normalizeImgurUrl("https://i.imgur.com/eScxuDz.gifv").sourceUrl, "https://i.imgur.com/eScxuDz.gif");
  assert.equal(normalizeImgurUrl("https://i.imgur.com/eScxuDz.webp").extension, "webp");
});

test("rejects albums, galleries, and unsupported page shapes", () => {
  assertPortalError(() => normalizeImgurUrl("https://imgur.com/a/eScxuDz"), "unsupported_collection");
  assertPortalError(() => normalizeImgurUrl("https://imgur.com/gallery/eScxuDz"), "unsupported_collection");
  assertPortalError(() => normalizeImgurUrl("https://imgur.com/user/example"), "unsupported_path");
});

test("rejects deceptive hosts, credentials, ports, and non-web schemes", () => {
  assertPortalError(() => normalizeImgurUrl("https://imgur.com.evil.test/eScxuDz.jpg"), "invalid_host");
  assertPortalError(() => normalizeImgurUrl("https://imgur.com@evil.test/eScxuDz.jpg"), "invalid_host");
  assertPortalError(() => normalizeImgurUrl("https://user:pass@imgur.com/eScxuDz"), "unsafe_url");
  assertPortalError(() => normalizeImgurUrl("https://i.imgur.com:8443/eScxuDz.jpg"), "unsafe_url");
  assertPortalError(() => normalizeImgurUrl("javascript:alert(1)"), "invalid_scheme");
});

test("rejects missing extensions, encoded path tricks, and unsupported media", () => {
  assertPortalError(() => normalizeImgurUrl("https://i.imgur.com/eScxuDz"), "not_direct_image");
  assertPortalError(() => normalizeImgurUrl("https://i.imgur.com/eScxuDz%2f.jpg"), "not_direct_image");
  assertPortalError(() => normalizeImgurUrl("https://i.imgur.com/eScxuDz.mp4"), "unsupported_type");
  assertPortalError(() => normalizeImgurUrl("https://i.imgur.com/eScxuDz.svg"), "unsupported_type");
});

test("extracts query and fragment URL forms with query precedence", () => {
  const encoded = encodeURIComponent(SOURCE);
  assert.equal(extractSourceFromLocation(`https://example.test/app/?url=${encoded}`), SOURCE);
  assert.equal(extractSourceFromLocation(`https://example.test/app/#url=${encoded}`), SOURCE);
  assert.equal(extractSourceFromLocation(`https://example.test/app/#${encoded}`), SOURCE);
  assert.equal(extractSourceFromLocation(`https://example.test/app/#${SOURCE}`), SOURCE);
  assert.equal(
    extractSourceFromLocation(`https://example.test/app/?url=${encoded}#url=${encodeURIComponent("https://i.imgur.com/other.jpg")}`),
    SOURCE
  );
  assert.equal(extractSourceFromLocation("https://example.test/app/"), null);
});

test("builds fragment-based share links and removes index/query state", () => {
  assert.equal(
    buildShareUrl(SOURCE, "https://paradoxgods.github.io/imgur-redirect/index.html?old=1#old"),
    `https://paradoxgods.github.io/imgur-redirect/#url=${encodeURIComponent(SOURCE)}`
  );
});

test("extracts only a matching, source-bound GitHub Camo URL", () => {
  assert.equal(extractCamoUrl(RENDERED, SOURCE), CAMO);
  assert.equal(
    extractCamoUrl(
      `<img data-canonical-src="${SOURCE}" data-src="https://example.test/wrong.jpg" src="${CAMO}" alt="image">`,
      SOURCE
    ),
    CAMO
  );
  assertPortalError(() => extractCamoUrl(RENDERED, "https://i.imgur.com/other.jpg"), "relay_mismatch");
  assertPortalError(
    () => extractCamoUrl(RENDERED.replaceAll("camo.githubusercontent.com", "example.test"), SOURCE),
    "invalid_relay_host"
  );
  assertPortalError(
    () =>
      extractCamoUrl(
        RENDERED.replaceAll(SOURCE_HEX, Buffer.from("https://i.imgur.com/other.jpg").toString("hex")),
        SOURCE
      ),
    "relay_mismatch"
  );
});

test("revalidates a cached Camo URL against its expected source", () => {
  assert.equal(validateCamoUrl(CAMO, SOURCE), CAMO);
  assertPortalError(() => validateCamoUrl(CAMO, "https://i.imgur.com/other.jpg"), "relay_mismatch");
  assertPortalError(() => validateCamoUrl(`${CAMO}?poisoned=1`, SOURCE), "invalid_relay_response");
});

test("requests Markdown without credentials and verifies the response", async () => {
  let observed;
  const fetchImpl = async (url, options) => {
    observed = { url, options };
    return new Response(RENDERED, { status: 200, headers: { "Content-Type": "text/html" } });
  };

  assert.equal(await requestCamoUrl(SOURCE, { fetchImpl }), CAMO);
  assert.equal(observed.url, "https://api.github.com/markdown");
  assert.equal(observed.options.method, "POST");
  assert.equal(observed.options.credentials, "omit");
  assert.deepEqual(JSON.parse(observed.options.body), { text: `![image](${SOURCE})`, mode: "markdown" });
});

test("reports GitHub API rate limiting without rendering the response", async () => {
  await assert.rejects(
    requestCamoUrl(SOURCE, { fetchImpl: async () => new Response("{}", { status: 429 }) }),
    (error) => error instanceof PortalError && error.code === "relay_rate_limited"
  );
});

test("distinguishes a policy refusal from an exhausted rate limit", async () => {
  await assert.rejects(
    requestCamoUrl(SOURCE, {
      fetchImpl: async () => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "42" } })
    }),
    (error) => error instanceof PortalError && error.code === "relay_refused"
  );
});

test("requires a canonical direct source for relay requests", async () => {
  await assert.rejects(
    requestCamoUrl("https://imgur.com/eScxuDz", { fetchImpl: async () => new Response(RENDERED) }),
    (error) => error instanceof PortalError && error.code === "noncanonical_source"
  );
});
