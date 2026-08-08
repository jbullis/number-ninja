const C = require("../js/curriculum.js");

function hash(seed) {
  let h = 2166136261;
  for (const ch of String(seed || "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed) {
  let s = hash(seed) || 1;
  return function() {
    s = Math.imul(1664525, s) + 1013904223;
    return (s >>> 0) / 4294967296;
  };
}
function ri(r, a, b) { return a + Math.floor(r() * (b - a + 1)); }
function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function choices(r, ans, cands) {
  const out = [ans];
  for (const c of cands) if (Number.isFinite(c) && !out.includes(c)) out.push(c);
  let d = 1;
  while (out.length < 4) {
    for (const c of [ans + d, Math.max(0, ans - d)]) if (!out.includes(c)) out.push(c);
    d++;
  }
  return shuffle(r, out.slice(0, 4)).map(v => ({ h:String(v), ok:v === ans }));
}
function gradeNum(g) { return g === "K" ? 0 : Number(g); }

function generatePlacementQuestion(skillId, seed) {
  const r = rng(seed + ":" + skillId);
  const skill = C.BY_ID[skillId];
  if (!skill) return null;
  const g = gradeNum(skill.grade);
  let a, b, ans, qHTML, tip;
  if (g <= 1) {
    const max = g === 0 ? 10 : 20;
    a = ri(r, 0, Math.max(3, max - 4));
    b = ri(r, 1, Math.max(2, max - a));
    ans = a + b;
    qHTML = '<div class="qBig">' + a + ' + ' + b + ' = ?</div>';
    tip = "Put the two groups together.";
    return { topic:skillId, qHTML, tip, choices:choices(r, ans, [ans + 1, Math.max(0, ans - 1), a, b]) };
  }
  if (g === 2) {
    a = ri(r, 10, 80); b = ri(r, 5, 90); ans = a + b;
    return { topic:skillId, qHTML:'<div class="qBig">' + a + ' + ' + b + ' = ?</div>', tip:"Add tens and ones carefully.", choices:choices(r, ans, [ans + 10, ans - 10, ans + 1]) };
  }
  if (g === 3) {
    a = ri(r, 2, 10); b = ri(r, 2, 10); ans = a * b;
    return { topic:skillId, qHTML:'<div class="qBig">' + a + ' x ' + b + ' = ?</div>', tip:"Think in equal groups.", choices:choices(r, ans, [ans + a, ans - b, a + b]) };
  }
  if (g === 4) {
    a = ri(r, 12, 35); b = ri(r, 3, 12); ans = a * b;
    return { topic:skillId, qHTML:'<div class="qBig">' + a + ' x ' + b + ' = ?</div>', tip:"Break the larger number into tens and ones.", choices:choices(r, ans, [ans + a, ans - b, a + b]) };
  }
  a = ri(r, 100, 900); b = ri(r, 10, 90); ans = a + b;
  return { topic:skillId, qHTML:'<div class="qBig">' + a + ' + ' + b + ' = ?</div>', tip:"Line up place values.", choices:choices(r, ans, [ans + 100, ans - 100, ans + 10]) };
}

module.exports = { generatePlacementQuestion };
