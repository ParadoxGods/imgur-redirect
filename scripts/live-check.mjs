import { normalizeImgurUrl, requestCamoUrl } from "../site/app.js";

const checks = [
  {
    input: "https://i.imgur.com/eScxuDz.jpg",
    expectedType: "image/jpeg",
    hasExpectedMagic: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  },
  {
    input: "https://i.imgur.com/3fpMI.gif",
    expectedType: "image/gif",
    hasExpectedMagic: (bytes) => /^GIF8[79]a$/.test(new TextDecoder().decode(bytes.subarray(0, 6)))
  }
];

for (const check of checks) {
  const source = normalizeImgurUrl(check.input).sourceUrl;
  const relay = await requestCamoUrl(source, { timeoutMs: 20_000 });
  const response = await fetch(relay, {
    method: "GET",
    redirect: "follow",
    headers: { Accept: check.expectedType },
    signal: AbortSignal.timeout(30_000)
  });

  if (!response.ok) {
    throw new Error(`Camo returned HTTP ${response.status} for ${source}.`);
  }

  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
  if (contentType !== check.expectedType) {
    throw new Error(`Camo returned ${contentType || "no content type"}, not ${check.expectedType}.`);
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 5 * 1024 * 1024) {
    throw new Error(`Live-check fixture unexpectedly exceeds 5 MiB: ${source}.`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!check.hasExpectedMagic(bytes)) {
    throw new Error(`Camo returned invalid ${check.expectedType} bytes for ${source}.`);
  }
  console.log(`Live relay OK: ${response.status} ${contentType} ${source}`);
  console.log(relay);
}
