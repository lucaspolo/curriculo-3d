// The three LLM vignettes, drawn on 2D canvases. Each one is a pure function of its own clock `t`, so the
// scene can restart, pause or jump to the end. All content continues the fictional Frankenstein case.

export const CW = 1280;
export const CH = 800;

const UI = {
  bg: "#0c1322",
  panel: "#121b2e",
  border: "#25324a",
  text: "#cfd8e6",
  muted: "#7d8aa3",
  teal: "#2de2c5",
  amber: "#ffb347",
  pink: "#ff4f8b",
  violet: "#a48bff",
  green: "#4ade80",
  yellow: "#ffd166",
  red: "#ff6b6b",
};
const SANS = (w, s) => `${w} ${s}px Inter, system-ui, sans-serif`;
const MONO = (w, s) => `${w} ${s}px 'JetBrains Mono', ui-monospace, monospace`;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function chrome(ctx, title, accent) {
  ctx.fillStyle = UI.bg;
  ctx.fillRect(0, 0, CW, CH);
  ctx.fillStyle = UI.panel;
  ctx.fillRect(0, 0, CW, 64);
  [UI.red, UI.yellow, UI.green].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(34 + i * 26, 32, 8, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = accent;
  ctx.font = MONO(600, 22);
  ctx.textAlign = "left";
  ctx.fillText(title, 130, 40);
}

/** Wraps text into lines that fit `width` with the current font. */
function wrap(ctx, text, width) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  words.forEach((w) => {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function chip(ctx, text, x, y, color) {
  ctx.font = MONO(600, 20);
  const w = ctx.measureText(text).width + 24;
  roundRect(ctx, x, y - 22, w, 32, 8, `${color}33`, color);
  ctx.fillStyle = color;
  ctx.fillText(text, x + 12, y);
  return w;
}

// ---------------------------------------------------------------------------------------------------
// 1. LLM step inside the ingestion pipeline: free text in, validated JSON out.

const FIELDS = {
  tipo: UI.teal,
  acao: UI.yellow,
  resultado: UI.green,
  alimentos: UI.amber,
  partes: UI.pink,
};

const SOURCE = [
  [["SENTENÇA", "tipo"]],
  ["Vistos. ", ["[PESSOA]", "partes"], " ajuizou"],
  [["ação de alimentos", "acao"], " contra ", ["[PESSOA]", "partes"], "."],
  ["Comprovadas a criação e a necessidade"],
  ["do autor, ", ["JULGO PROCEDENTE", "resultado"], " o"],
  ["pedido e fixo os alimentos em"],
  [["30% dos rendimentos", "alimentos"], " do réu."],
];

const JSON_LINES = [
  ["{", null],
  ['  "tipo": "sentença",', "tipo"],
  ['  "acao": "alimentos",', "acao"],
  ['  "resultado": "procedente",', "resultado"],
  ['  "alimentos": "30% dos rendimentos",', "alimentos"],
  ['  "partes": ["[PESSOA]", "[PESSOA]"]', "partes"],
  ["}", null],
];
const JSON_TEXT = JSON_LINES.map(([l]) => l).join("\n");
const TYPE_START = 0.8;
const TYPE_RATE = 42;

export const pipeline = {
  title: "LLM no pipeline",
  duration: 11,
  phaseAt(t) {
    const typed = (t - TYPE_START) * TYPE_RATE;
    return { llm: typed > 0 && typed < JSON_TEXT.length };
  },
  draw(ctx, t) {
    chrome(ctx, "etapa do pipeline: extrair_decisao · LLM", UI.teal);
    const typed = Math.max(0, Math.floor((t - TYPE_START) * TYPE_RATE));

    // Which fields have been written so far decides which source passages light up.
    const done = new Set();
    let offset = 0;
    JSON_LINES.forEach(([line, key]) => {
      if (key && typed >= offset + line.length) done.add(key);
      offset += line.length + 1;
    });

    ctx.textAlign = "left";
    ctx.fillStyle = UI.muted;
    ctx.font = MONO(400, 18);
    ctx.fillText("entrada · decisoes.anonimizadas", 48, 112);
    ctx.fillText("saída estruturada (JSON)", 668, 112);
    roundRect(ctx, 40, 128, 590, 470, 12, UI.panel, UI.border);
    roundRect(ctx, 650, 128, 590, 470, 12, UI.panel, UI.border);

    ctx.font = SANS(400, 26);
    SOURCE.forEach((parts, i) => {
      let x = 68;
      const y = 186 + i * 56;
      parts.forEach((p) => {
        const [text, key] = typeof p === "string" ? [p, null] : p;
        const w = ctx.measureText(text).width;
        if (key && done.has(key)) {
          roundRect(ctx, x - 4, y - 28, w + 8, 38, 6, `${FIELDS[key]}40`);
        }
        ctx.fillStyle = key && done.has(key) ? FIELDS[key] : UI.text;
        ctx.font = key === "tipo" ? SANS(700, 26) : SANS(400, 26);
        ctx.fillText(text, x, y);
        x += w;
      });
    });

    ctx.font = MONO(400, 24);
    let left = typed;
    JSON_LINES.forEach(([line, key], i) => {
      if (left <= 0) return;
      const shown = line.slice(0, left);
      left -= line.length + 1;
      ctx.fillStyle = key ? FIELDS[key] : UI.text;
      ctx.fillText(shown, 672, 186 + i * 52);
      if (left <= 0 && Math.floor(t * 3) % 2 === 0) {
        ctx.fillRect(676 + ctx.measureText(shown).width, 166 + i * 52, 12, 26);
      }
    });

    // Schema validation, then the record moves on to the next Kafka topic.
    const validateStart = TYPE_START + JSON_TEXT.length / TYPE_RATE + 0.3;
    if (t > validateStart) {
      ctx.fillStyle = UI.muted;
      ctx.font = MONO(400, 18);
      ctx.fillText("validação do schema", 48, 640);
      let x = 48;
      Object.entries(FIELDS).forEach(([key, color], i) => {
        if (t > validateStart + 0.2 * i) x += chip(ctx, `${key} ✓`, x, 682, color) + 12;
      });
    }
    if (t > validateStart + 1.6) {
      ctx.font = MONO(600, 22);
      ctx.fillStyle = UI.teal;
      ctx.fillText("→ publicado em decisoes.estruturadas", 48, 752);
    }
  },
};

// ---------------------------------------------------------------------------------------------------
// 2. Agent in the product: question, tool loop, grounded answer.

export const TOOLS = [
  { call: 'buscar_processo("1818.0001-07")', result: "Ação de alimentos · sentença procedente" },
  { call: "consultar_decisao(tipo=\"sentença\")", result: "30% dos rendimentos desde out/1818" },
  { call: "calcular_atualizacao(parcelas=12)", result: "total atualizado: R$ 18.180,00" },
];
const QUESTION = "Sou advogado do autor no processo 1818.0001-07. Quanto o réu deve de pensão atrasada?";
const ANSWER =
  "Pela sentença, o réu deve 30% dos rendimentos desde outubro de 1818. Com 12 parcelas em atraso, o total atualizado é de R$ 18.180,00.";
const TOOL_START = 2;
const TOOL_STEP = 1.7;
const ANSWER_START = TOOL_START + TOOLS.length * TOOL_STEP + 0.3;
const ANSWER_RATE = 70;

export const product = {
  title: "Agente no produto",
  duration: 12,
  phaseAt(t) {
    const k = (t - TOOL_START) / TOOL_STEP;
    const i = Math.floor(k);
    const calling = i >= 0 && i < TOOLS.length && k - i < 0.55;
    return {
      llm: (t > 1 && t < TOOL_START) || (t > ANSWER_START && t < ANSWER_START + ANSWER.length / ANSWER_RATE),
      tool: calling ? i : null,
    };
  },
  draw(ctx, t) {
    chrome(ctx, "assistente jurídico · agente com ferramentas", UI.amber);
    ctx.textAlign = "left";

    if (t > 0.3) {
      ctx.font = SANS(400, 25);
      const lines = wrap(ctx, QUESTION, 640);
      const h = lines.length * 36 + 28;
      roundRect(ctx, CW - 40 - 690, 92, 690, h, 18, "#2a2f45", UI.border);
      ctx.fillStyle = UI.text;
      lines.forEach((l, i) => ctx.fillText(l, CW - 40 - 690 + 24, 132 + i * 36));
    }

    if (t > 1 && t < TOOL_START) {
      ctx.fillStyle = UI.violet;
      ctx.font = MONO(400, 22);
      ctx.fillText(`pensando${".".repeat(1 + (Math.floor(t * 4) % 3))}`, 48, 244);
    }

    TOOLS.forEach((tool, i) => {
      const start = TOOL_START + i * TOOL_STEP;
      if (t < start) return;
      const y = 236 + i * 74;
      ctx.font = MONO(600, 22);
      ctx.fillStyle = UI.amber;
      ctx.fillText(`→ ${tool.call}`, 48, y);
      if (t > start + TOOL_STEP * 0.55) {
        ctx.font = MONO(400, 21);
        ctx.fillStyle = UI.green;
        ctx.fillText(`  ✓ ${tool.result}`, 48, y + 32);
      } else {
        ctx.fillStyle = UI.muted;
        ctx.font = MONO(400, 21);
        ctx.fillText(`  executando${".".repeat(1 + (Math.floor(t * 4) % 3))}`, 48, y + 32);
      }
    });

    if (t > ANSWER_START) {
      const shown = ANSWER.slice(0, Math.floor((t - ANSWER_START) * ANSWER_RATE));
      ctx.font = SANS(400, 25);
      const lines = wrap(ctx, ANSWER, 1060);
      roundRect(ctx, 40, 470, 1110, lines.length * 36 + 30, 18, "#16233a", UI.amber);
      ctx.fillStyle = UI.text;
      let left = shown.length;
      lines.forEach((l, i) => {
        if (left <= 0) return;
        ctx.fillText(l.slice(0, left), 64, 512 + i * 36);
        left -= l.length + 1;
      });
      if (shown.length === ANSWER.length) {
        chip(ctx, "fonte: processo 1818.0001-07 · sentença", 40, 640, UI.teal);
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------------
// 3. Coding agent: from an issue to an approved pull request.

const STEPS = [
  { name: "reproduzir o erro", start: 0.8, end: 2.2 },
  { name: "escrever a correção", start: 2.2, end: 4.6 },
  { name: "rodar os testes", start: 4.6, end: 6.8 },
  { name: "abrir o PR", start: 6.8, end: 8 },
  { name: "revisão humana", start: 8, end: 9.8 },
];
const OLD_LINE = '-     return parte["nome"]';
const NEW_LINE = '+     return parte.get("nome") or SEM_NOME_DE_REGISTRO';
const TESTS = ["test_parte_sem_nome", "test_parte_com_nome", "test_partes_multiplas"];

export const coding = {
  title: "Agente de código",
  duration: 12,
  phaseAt(t) {
    return { llm: t > STEPS[0].start && t < STEPS[1].end };
  },
  draw(ctx, t) {
    chrome(ctx, "agente de código · issue #1818", UI.green);
    ctx.textAlign = "left";

    roundRect(ctx, 40, 84, CW - 80, 54, 10, UI.panel, UI.border);
    ctx.font = SANS(600, 24);
    ctx.fillStyle = UI.text;
    ctx.fillText("#1818 · O extrator falha quando a parte não tem nome de registro", 60, 120);

    // Step list
    STEPS.forEach((s, i) => {
      const y = 196 + i * 58;
      const state = t >= s.end ? "done" : t >= s.start ? "running" : "todo";
      const color = state === "done" ? UI.green : state === "running" ? UI.amber : UI.muted;
      ctx.fillStyle = color;
      ctx.font = MONO(600, 22);
      const icon = state === "done" ? "✓" : state === "running" ? "●" : "○";
      ctx.fillText(icon, 48, y);
      ctx.font = SANS(state === "running" ? 600 : 400, 22);
      ctx.fillText(s.name, 80, y);
    });

    // Diff
    roundRect(ctx, 330, 160, 910, 170, 10, UI.panel, UI.border);
    ctx.font = MONO(400, 20);
    ctx.fillStyle = UI.muted;
    ctx.fillText("extrator.py", 350, 192);
    ctx.font = MONO(400, 22);
    ctx.fillStyle = UI.text;
    ctx.fillText("  def nome_da_parte(parte):", 350, 232);
    if (t >= STEPS[1].start) {
      ctx.fillStyle = "#ff6b6b26";
      ctx.fillRect(342, 244, 890, 34);
      ctx.fillStyle = UI.red;
      ctx.fillText(OLD_LINE, 350, 270);
      const k = clamp01((t - STEPS[1].start - 0.4) / 1.6);
      if (k > 0) {
        ctx.fillStyle = "#4ade8026";
        ctx.fillRect(342, 282, 890, 34);
        ctx.fillStyle = UI.green;
        ctx.fillText(NEW_LINE.slice(0, Math.ceil(k * NEW_LINE.length)), 350, 308);
      }
    } else {
      ctx.fillText('      return parte["nome"]', 350, 270);
    }

    // Terminal
    roundRect(ctx, 330, 346, 910, 214, 10, "#05090f", UI.border);
    ctx.font = MONO(400, 21);
    ctx.fillStyle = UI.muted;
    ctx.fillText("$ pytest tests/test_extrator.py", 350, 382);
    if (t >= STEPS[0].start && t < STEPS[2].start) {
      ctx.fillStyle = UI.red;
      ctx.fillText("test_parte_sem_nome ............ FAILED", 350, 418);
      ctx.fillText("KeyError: 'nome'", 350, 452);
    } else if (t >= STEPS[2].start) {
      TESTS.forEach((name, i) => {
        if (t < STEPS[2].start + 0.5 + i * 0.5) return;
        ctx.fillStyle = UI.green;
        ctx.fillText(`${name.padEnd(30, " ")} PASSED`, 350, 418 + i * 34);
      });
      if (t > STEPS[2].start + 2) {
        ctx.fillStyle = UI.green;
        ctx.font = MONO(600, 21);
        ctx.fillText("3 passed in 0.42s", 350, 530);
      }
    }

    // Pull request and the human review
    if (t >= STEPS[3].start) {
      roundRect(ctx, 330, 578, 910, 176, 10, UI.panel, UI.green);
      ctx.font = SANS(600, 24);
      ctx.fillStyle = UI.text;
      ctx.fillText("PR #1819 · Trata parte sem nome de registro", 352, 620);
      ctx.font = MONO(400, 20);
      ctx.fillStyle = UI.green;
      ctx.fillText("+3", 352, 656);
      ctx.fillStyle = UI.red;
      ctx.fillText("−1", 392, 656);
      ctx.fillStyle = UI.muted;
      ctx.fillText("· checks ✓ · aberto pelo agente", 436, 656);
      if (t >= STEPS[4].start) {
        ctx.fillStyle = UI.violet;
        ctx.beginPath();
        ctx.arc(372, 708, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = UI.bg;
        ctx.font = SANS(700, 20);
        ctx.textAlign = "center";
        ctx.fillText("R", 372, 715);
        ctx.textAlign = "left";
        ctx.font = SANS(400, 22);
        ctx.fillStyle = UI.text;
        const approved = t >= STEPS[4].end;
        ctx.fillText(approved ? "revisão humana: aprovado ✓" : "revisão humana em andamento…", 404, 716);
      }
    }
  },
};

export const VIGNETTES = [pipeline, product, coding];
