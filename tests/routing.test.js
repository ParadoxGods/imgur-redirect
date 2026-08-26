import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const notFoundHtml = readFileSync(new URL("../site/404.html", import.meta.url), "utf8");
const redirectScript = notFoundHtml.match(/<script>([\s\S]*?)<\/script>/i)?.[1];

assert.ok(redirectScript, "404.html must contain its redirect script");

function route(pathname, hostname = "paradoxgods.github.io") {
  let destination = null;
  const window = {
    location: {
      pathname,
      hostname,
      origin: "https://paradoxgods.github.io",
      replace(value) {
        destination = value;
      }
    }
  };

  vm.runInNewContext(redirectScript, {
    window,
    URL,
    encodeURIComponent,
    decodeURIComponent
  });
  return destination;
}

test("404 short image routes redirect to the project root fragment", () => {
  assert.equal(
    route("/imgur-redirect/i/eScxuDz.jpg"),
    "https://paradoxgods.github.io/imgur-redirect/#eScxuDz.jpg"
  );
  assert.equal(
    route("/imgur-redirect/i/eScxuDz.gifv"),
    "https://paradoxgods.github.io/imgur-redirect/#eScxuDz.gif"
  );
  assert.equal(
    route("/imgur-redirect/i/eScxuDz.gif"),
    "https://paradoxgods.github.io/imgur-redirect/#eScxuDz.gif"
  );
});

test("404 encoded and raw full-URL routes preserve the Imgur source", () => {
  const source = "https://i.imgur.com/eScxuDz.png";
  const expected = `https://paradoxgods.github.io/imgur-redirect/#url=${encodeURIComponent(source)}`;
  assert.equal(route(`/imgur-redirect/view/${encodeURIComponent(source)}`), expected);
  assert.equal(route(`/imgur-redirect/${source}`), expected);
});

test("404 rejects invalid short media paths and returns unknown paths home", () => {
  assert.equal(route("/imgur-redirect/i/not-valid.svg"), "https://paradoxgods.github.io/imgur-redirect/");
  assert.equal(route("/imgur-redirect/unknown"), "https://paradoxgods.github.io/imgur-redirect/");
});
