import { test } from "node:test";
import assert from "node:assert/strict";
import { pickLanguage } from "../src/lib/language.js";

test("a ?lang= link wins over the saved choice and the system", () => {
  assert.equal(pickLanguage({ fromUrl: "en", saved: "pt", systemLanguages: ["pt-BR"] }), "en");
});

test("the saved choice wins over the system language", () => {
  assert.equal(pickLanguage({ fromUrl: null, saved: "pt", systemLanguages: ["en-US"] }), "pt");
});

test("the first supported system language decides", () => {
  assert.equal(pickLanguage({ fromUrl: null, saved: null, systemLanguages: ["pt-PT", "en"] }), "pt");
  assert.equal(pickLanguage({ fromUrl: null, saved: null, systemLanguages: ["de-DE", "en-GB", "pt-BR"] }), "en");
});

test("unknown values are ignored and English is the fallback", () => {
  assert.equal(pickLanguage({ fromUrl: "fr", saved: "xx", systemLanguages: ["es-ES", "fr"] }), "en");
  assert.equal(pickLanguage({ fromUrl: null, saved: null }), "en");
});
