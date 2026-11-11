import assert from "node:assert/strict";
import test from "node:test";
import { neutralizeEmailHtml } from "./emailHtml.ts";

test("removes meta refresh redirects, including quoted '>' tricks", () => {
  assert.equal(neutralizeEmailHtml('<p>a</p><meta http-equiv="refresh" content="0;url=https://evil">'), "<p>a</p>");
  assert.equal(neutralizeEmailHtml('<META content="a>b" HTTP-EQUIV="refresh">x'), "x");
  assert.equal(neutralizeEmailHtml("<meta/http-equiv=refresh content=0;url=https://evil>x"), "x");
  assert.equal(neutralizeEmailHtml("<meta content='0;url=x' http-equiv='Refresh' >y"), "y");
});

test("removes base tags and keeps harmless meta and other markup", () => {
  assert.equal(neutralizeEmailHtml('<base href="https://evil/"><a href="/x">x</a>'), '<a href="/x">x</a>');
  assert.equal(neutralizeEmailHtml('<meta charset="utf-8"><b>hi</b>'), '<meta charset="utf-8"><b>hi</b>');
  assert.equal(neutralizeEmailHtml('<meta name="x" content=" http-equiv=refresh">ok'), '<meta name="x" content=" http-equiv=refresh">ok');
  assert.equal(neutralizeEmailHtml("<metadata>keep</metadata><baseline>"), "<metadata>keep</metadata><baseline>");
});
