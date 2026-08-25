import { normalizeImgurUrl, requestCamoUrl } from "../site/app.js";

const source = normalizeImgurUrl("https://i.imgur.com/eScxuDz.jpg").sourceUrl;
const relay = await requestCamoUrl(source, { timeoutMs: 20_000 });
const response = await fetch(relay, {
  method: "GET",
  redirect: "follow",
  headers: { Accept: "image/*" },
  signal: AbortSignal.timeout(30_000)
});

if (!response.ok) {
  throw new Error(`Camo returned HTTP ${response.status}.`);
}

const contentType = response.headers.get("content-type") ?? "";
if (!contentType.startsWith("image/")) {
  throw new Error(`Camo returned ${contentType || "no content type"}, not an image.`);
}

await response.body?.cancel();
console.log(`Live relay OK: ${response.status} ${contentType}`);
console.log(relay);
