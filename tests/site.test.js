import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../site/index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../site/styles.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../site/app.js", import.meta.url), "utf8");

test("the portal declares a dark browser theme and accessible focus color", () => {
  assert.match(html, /<meta name="color-scheme" content="dark">/);
  assert.match(html, /<meta name="theme-color" content="#091114">/);
  assert.match(styles, /color-scheme:\s*dark/);
  assert.match(styles, /--accent:\s*#76f2c1/);
  assert.match(styles, /outline:\s*3px solid var\(--accent\)/);
});

test("the GIF viewer includes an animation visibility control", () => {
  assert.match(html, /id="animation-hidden"[^>]*hidden/);
  assert.match(html, /id="toggle-animation"[^>]*hidden/);
  assert.match(html, /GIF hidden — opening may animate/);
  assert.match(app, /Open the hidden GIF in a new tab; it may animate/);
});

test("every element queried during initialization exists in the page", () => {
  const queriedIds = [...app.matchAll(/document\.querySelector\("#([A-Za-z0-9-]+)"\)/g)].map((match) => match[1]);
  assert.ok(queriedIds.length > 0);
  for (const id of queriedIds) {
    assert.match(html, new RegExp(`id="${id}"`), `Missing #${id}`);
  }
});
