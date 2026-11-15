// The fictional court filing of the Trust & Privacy scene: its text in both languages, the personal data in
// it, and the canvas drawing. Kept apart from the 3D so every version of the site shows the same page.
import * as THREE from "three";
import { COLORS } from "../lib/kit.js";
import { tr } from "../i18n.js";

export const CW = 1024;
export const CH = 1400;
export const PAGE_W = 6.8;
export const PAGE_H = (PAGE_W * CH) / CW;
export const BODY_FONT = 34;
export const LINE_H = 54;
export const MARGIN = 70;

export const TYPES = {
  PESSOA: { name: tr("PESSOA", "PERSON"), color: COLORS.privacy },
  CPF: { name: tr("CPF", "TAX ID"), color: COLORS.message },
  ENDERECO: { name: tr("ENDEREÇO", "ADDRESS"), color: COLORS.warn },
  TELEFONE: { name: tr("TELEFONE", "PHONE"), color: COLORS.kafka },
};

// Every name, number and address below is fictional; the CPFs have invalid check digits on purpose.
export const E = {
  criatura: {
    text: tr("a Criatura", "the Creature"),
    ner: "?",
    llm: { type: "PESSOA", note: tr("aqui a expressão identifica o autor da ação", "here the phrase identifies the plaintiff") },
  },
  cpfAutor: { text: "181.818.181-18", type: "CPF" },
  endereco: {
    text: tr("Rua Mary Shelley, 1818, Ingolstadt", "1818 Mary Shelley St., Ingolstadt"),
    ner: tr("PESSOA?", "PERSON?"),
    llm: {
      type: "ENDERECO",
      note: tr(
        "é nome de rua, não de pessoa; continua sendo dado pessoal (endereço)",
        "it is a street name, not a person; still personal data (an address)",
      ),
    },
  },
  victor: { text: "Victor Frankenstein", type: "PESSOA" },
  cpfReu: { text: "123.456.789-00", type: "CPF" },
  telefone: { text: "(00) 91818-1818", type: "TELEFONE" },
  henry: { text: "Henry Clerval", type: "PESSOA" },
  livro: {
    text: tr("“Frankenstein, ou o Moderno Prometeu”", "“Frankenstein; or, The Modern Prometheus”"),
    ner: tr("PESSOA?", "PERSON?"),
    llm: { keep: true, note: tr("é título de livro, não dado pessoal; fica no texto", "it is a book title, not personal data; it stays in the text") },
  },
};
export const ENTITIES = Object.values(E);
export const AMBIGUOUS = ENTITIES.filter((e) => e.llm);

// Line breaks are part of each version: the page has a fixed width, so English wraps differently.
export const LINES = tr(
  [
    { style: "title", text: "PODER JUDICIÁRIO" },
    { style: "subtitle", text: "Vara de Família de Genebra" },
    { style: "meta", text: "Processo nº 1818.0001-07 · Ação de alimentos" },
    { style: "badge", text: "SEGREDO DE JUSTIÇA" },
    { style: "gap" },
    { parts: ["AUTOR: ", E.criatura, ", sem nome de registro,"] },
    { parts: ["CPF ", E.cpfAutor, ", residente na"] },
    { parts: [E.endereco, "."] },
    { parts: ["RÉU: ", E.victor, ", CPF ", E.cpfReu, ","] },
    { parts: ["telefone ", E.telefone, "."] },
    { style: "gap" },
    { parts: ["O autor alega que o réu o criou em"] },
    { parts: ["laboratório e o abandonou sem prestar"] },
    { parts: ["alimentos, conforme o art. 1.694 do"] },
    { parts: ["Código Civil. Testemunha: ", E.henry, "."] },
    { parts: ["A obra ", E.livro] },
    { parts: ["não se confunde com as partes. O autor"] },
    { parts: ["pede a proteção dos seus dados pessoais."] },
    { style: "gap" },
    { style: "meta", text: "Genebra, 31 de outubro de 1818." },
    { style: "legend" },
  ],
  [
    { style: "title", text: "JUDICIAL BRANCH" },
    { style: "subtitle", text: "Family Court of Geneva" },
    { style: "meta", text: "Case no. 1818.0001-07 · Child support claim" },
    { style: "badge", text: "UNDER SEAL" },
    { style: "gap" },
    { parts: ["PLAINTIFF: ", E.criatura, ", with no registered"] },
    { parts: ["name, tax ID ", E.cpfAutor, ", residing at"] },
    { parts: [E.endereco, "."] },
    { parts: ["DEFENDANT: ", E.victor, ","] },
    { parts: ["tax ID ", E.cpfReu, ", phone ", E.telefone, "."] },
    { style: "gap" },
    { parts: ["The plaintiff claims the defendant created"] },
    { parts: ["it in a laboratory and abandoned it without"] },
    { parts: ["support, under art. 1,694 of the Civil"] },
    { parts: ["Code. Witness: ", E.henry, "."] },
    { parts: ["The work ", E.livro] },
    { parts: ["is not to be confused with the parties. The"] },
    { parts: ["plaintiff asks that its personal data be protected."] },
    { style: "gap" },
    { style: "meta", text: "Geneva, October 31, 1818." },
    { style: "legend" },
  ],
);

export const finalType = (e) => (e.llm ? (e.llm.keep ? null : e.llm.type) : e.type);

/** Draws the page; in "anon" mode personal data is replaced by [TYPE] placeholders. Returns span rects. */
export function drawPage(ctx, mode) {
  ctx.fillStyle = "#d9dde6";
  ctx.fillRect(0, 0, CW, CH);
  ctx.strokeStyle = "#9aa3b5";
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, CW - 48, CH - 48);
  const font = (w, s) => `${w} ${s}px Inter, system-ui, sans-serif`;
  const rects = new Map();
  let y = 130;
  LINES.forEach((line) => {
    ctx.fillStyle = "#1a2236";
    ctx.textAlign = "left";
    if (line.style === "gap") {
      y += LINE_H * 0.6;
      return;
    }
    if (line.style === "title" || line.style === "subtitle") {
      ctx.font = line.style === "title" ? font(700, 36) : font(400, 28);
      ctx.textAlign = "center";
      ctx.fillText(line.text, CW / 2, y);
      y += line.style === "title" ? 48 : 52;
      return;
    }
    if (line.style === "legend") {
      // Color key for the NER highlights, at the foot of the page.
      ctx.font = font(600, 23);
      const items = [...Object.values(TYPES), { name: tr("AMBÍGUO → LLM", "AMBIGUOUS → LLM"), color: COLORS.llm }];
      let lx = MARGIN;
      const ly = CH - 80;
      items.forEach((it) => {
        ctx.fillStyle = `#${new THREE.Color(it.color).getHexString()}`;
        ctx.fillRect(lx, ly - 18, 20, 20);
        ctx.fillStyle = "#4a5570";
        ctx.fillText(it.name, lx + 28, ly);
        lx += ctx.measureText(it.name).width + 50;
      });
      return;
    }
    if (line.style === "meta") {
      ctx.font = font(400, 24);
      ctx.fillStyle = "#4a5570";
      ctx.textAlign = "center";
      ctx.fillText(line.text, CW / 2, y);
      y += 48;
      return;
    }
    if (line.style === "badge") {
      ctx.font = font(700, 20);
      const w = ctx.measureText(line.text).width + 32;
      ctx.fillStyle = "#8a1c3c";
      ctx.fillRect(CW / 2 - w / 2, y - 24, w, 36);
      ctx.fillStyle = "#ffe3ea";
      ctx.textAlign = "center";
      ctx.fillText(line.text, CW / 2, y + 1);
      y += 64;
      return;
    }
    ctx.font = font(400, BODY_FONT);
    let x = MARGIN;
    line.parts.forEach((part) => {
      const text = typeof part === "string" ? part : part.text;
      const w = ctx.measureText(text).width;
      if (typeof part !== "string") {
        const rect = { x: x - 4, y: y - BODY_FONT * 0.88, w: w + 8, h: BODY_FONT * 1.2 };
        rects.set(part, rect);
        const type = finalType(part);
        if (mode === "anon" && type) {
          ctx.fillStyle = "#0b0f18";
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
          ctx.fillStyle = "#7d8aa3";
          ctx.font = font(700, 18);
          ctx.textAlign = "center";
          ctx.fillText(`[${TYPES[type].name}]`, rect.x + rect.w / 2, y - 4);
          ctx.textAlign = "left";
          ctx.font = font(400, BODY_FONT);
          x += w;
          return;
        }
      }
      ctx.fillStyle = "#1a2236";
      ctx.fillText(text, x, y);
      x += w;
    });
    y += LINE_H;
  });
  return rects;
}

// Canvas pixels to page-local units (page centered at the origin, +y up).
export const toLocalX = (cx) => (cx / CW - 0.5) * PAGE_W;
export const toLocalY = (cy) => (0.5 - cy / CH) * PAGE_H;
