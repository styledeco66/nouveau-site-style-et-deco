import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const SOURCE = new URL("../sitesite-template/assets/js/app.js", import.meta.url);

const classList = () => ({ toggle() {}, add() {}, remove() {}, contains() { return false; } });

const runAppForPerpignan = () => {
  let onReady;
  const subject = { value: "", required: true, dataset: {} };
  const form = {
    classList: classList(),
    querySelector(selector) {
      if (selector === 'input[name="subject"]') return subject;
      return null;
    },
    querySelectorAll() { return []; },
  };
  const document = {
    hidden: false,
    addEventListener(type, callback) { if (type === "DOMContentLoaded") onReady = callback; },
    querySelectorAll(selector) { return selector === ".js-lead-form" ? [form] : []; },
    querySelector() { return null; },
  };
  const window = {
    addEventListener() {},
    location: { hash: "" },
    matchMedia() { return { matches: false }; },
    requestAnimationFrame(callback) { callback(); },
    setTimeout() {},
  };
  const sessionStorage = { getItem() { return null; }, removeItem() {}, setItem() {} };
  vm.runInNewContext(readFileSync(SOURCE, "utf8"), { document, window, sessionStorage });
  onReady();
  return subject.value;
};

test("Perpignan conserve le champ Type de travaux vide au chargement", () => {
  assert.equal(runAppForPerpignan(), "");
});
