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
function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function strip(s) { return String(s).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(); }
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; }
function frac(n, d) { const g = gcd(n, d); n /= g; d /= g; return d === 1 ? String(n) : n + "/" + d; }
function money(cents) { return "$" + (cents / 100).toFixed(2); }
function timeText(hour, minute) { return ((hour - 1) % 12 + 1) + ":" + String(minute).padStart(2, "0"); }
function q(skillId, html, answer, distractors, tip, meta) {
  const exact = String(answer);
  const seen = new Set([exact]);
  const all = [{ h: exact, ok: true }];
  (distractors || []).map(String).forEach((d) => {
    if (d !== exact && !seen.has(d) && d !== "NaN" && d !== "Infinity" && d !== "-Infinity") {
      seen.add(d);
      all.push({ h: d, ok: false });
    }
  });
  let n = 1;
  const base = Number(answer);
  const fillBase = Number.isFinite(base) ? base : 0;
  while (all.length < 4) {
    const d = String(fillBase + n);
    if (!seen.has(d)) { seen.add(d); all.push({ h: d, ok: false }); }
    n++;
  }
  const r = rng(skillId + ":" + html + ":" + answer);
  return { topic: skillId, qHTML: html, tip: tip || "Take your time and use what you know.", choices: shuffle(r, all.slice(0, 4)), meta: Object.assign({ answer: exact }, meta || {}) };
}
function nq(skillId, html, ans, ds, tip, meta) {
  return q(skillId, html, ans, ds.filter((x) => Number.isFinite(Number(x))).map((x) => Math.max(0, Math.round(Number(x)))), tip, meta);
}
function visual(n, symbol) {
  return '<div class="qVisual" aria-label="' + n + ' objects">' + Array.from({ length: Math.max(0, Math.min(20, n)) }, () => symbol || "*").join(" ") + '</div>';
}
function gradeNum(g) { return g === "K" ? 0 : Number(g); }

function generatePlacementQuestion(skillId, seed) {
  const r = rng(seed + ":" + skillId);
  const skill = C.BY_ID[skillId];
  if (!skill) return null;
  let a, b, c, ans;
  switch (skillId) {
    case "k.count100":
      a = pick(r, [0, 10, 20, 30, 40, 50, 60, 70]);
      ans = a + 20;
      return nq(skillId, '<div class="qBig">' + a + ", " + (a + 10) + ', ?</div><div class="qSub">Count by tens</div>', ans, [ans - 10, ans + 10, ans + 1], "Each number is 10 more.", { kind: "sequence", step: 10 });
    case "k.quantity10":
    case "k.subitize10":
      ans = ri(r, 1, 10);
      return nq(skillId, visual(ans, "star") + '<div class="qSub">How many?</div>', ans, [ans - 1, ans + 1, ans + 2], "Count the objects or look for a group you know.", { kind: "count" });
    case "k.ordinal10":
      ans = ri(r, 1, 5);
      return q(skillId, '<div class="qBig">line up: cat dog sun car cup</div><div class="qSub">Which place is the ' + ans + suffix(ans) + " object?</div>", ["cat", "dog", "sun", "car", "cup"][ans - 1], ["cat", "dog", "sun", "car", "cup"], "Start at the left and count places.", { kind: "ordinal" });
    case "k.countFrom20":
      a = ri(r, 0, 18);
      return nq(skillId, '<div class="qBig">' + a + ", ?</div><div class=\"qSub\">What comes next?</div>", a + 1, [a, a + 2, Math.max(0, a - 1)], "Count one more.", { kind: "sequence", step: 1 });
    case "k.readWrite20":
      ans = ri(r, 0, 20);
      return nq(skillId, '<div class="qBig">' + ans + '</div><div class="qSub">Pick the matching number.</div>', ans, [ans - 1, ans + 1, ans + 2], "Match the written number.", { kind: "number" });
    case "k.oneMoreLess10":
      a = ri(r, 1, 9); b = pick(r, [-1, 1]); ans = a + b;
      return nq(skillId, '<div class="qBig">' + a + '</div><div class="qSub">What is one ' + (b > 0 ? "more" : "less") + "?</div>", ans, [a, ans + b, Math.max(0, ans - b)], "Move one counting step.", { kind: "one_more_less" });
    case "k.compare10":
      a = ri(r, 0, 10); b = ri(r, 0, 10); if (a === b) b = (b + 3) % 11; ans = Math.max(a, b);
      return nq(skillId, '<div class="qBig">' + a + " or " + b + '</div><div class="qSub">Which is more?</div>', ans, [Math.min(a, b), ans + 1, Math.max(0, ans - 1)], "The bigger number is farther when you count.", { kind: "compare" });
    case "k.compose10":
    case "k.addSub10":
      a = ri(r, 0, 5); b = ri(r, 1, 5); ans = Math.min(10, a + b);
      return nq(skillId, visual(a, "dot") + '<div class="qBig">+ ' + (ans - a) + " more = ?</div>", ans, [ans - 1, ans + 1, a], "Put the two groups together.", { kind: "add" });
    case "k.fairShare":
      ans = pick(r, ["equal", "not equal"]);
      return q(skillId, '<div class="qBig">2 and ' + (ans === "equal" ? "2" : "3") + '</div><div class="qSub">Are the groups equal?</div>', ans, ["equal", "not equal", "more", "less"], "Equal groups have the same amount.", { kind: "equal_groups" });
    case "k.coins":
      ans = pick(r, ["penny", "nickel", "dime", "quarter"]);
      return q(skillId, '<div class="qBig">' + ans + '</div><div class="qSub">Pick the matching coin name.</div>', ans, ["penny", "nickel", "dime", "quarter"], "Look at the coin name.", { kind: "money_identify" });
    case "k.sort":
      return q(skillId, '<div class="qBig">red ball, red cup, blue ball</div><div class="qSub">Which object belongs with red things?</div>', "red hat", ["blue hat", "green box", "yellow sun"], "Sort by the same attribute.", { kind: "sort" });
    case "k.patterns":
    case "k.logic":
      return q(skillId, '<div class="qBig">red, blue, red, blue, ?</div>', "red", ["blue", "green", "yellow"], "Find what repeats.", { kind: "pattern" });
    case "k.measureCompare":
      a = ri(r, 3, 8); b = ri(r, 1, 7); if (a === b) b++;
      return q(skillId, '<div class="qBig">' + "pencil " + a + " cubes, crayon " + b + ' cubes</div><div class="qSub">Which is longer?</div>', a > b ? "pencil" : "crayon", ["pencil", "crayon", "same"], "Longer means it takes more cubes.", { kind: "measurement_compare" });
    case "k.shapes":
    case "k.composeShapes":
      ans = pick(r, ["triangle", "square", "circle", "rectangle"]);
      return q(skillId, '<div class="qBig">' + ans + '</div><div class="qSub">Name the shape.</div>', ans, ["triangle", "square", "circle", "rectangle"], "Look at sides and corners.", { kind: "shape" });
  }

  if (skillId === "1.wordProblems" || skillId === "2.wordProblems") {
    a = ri(r, 4, skill.grade === "1" ? 12 : 45); b = ri(r, 2, skill.grade === "1" ? 8 : 35); ans = a + b;
    return nq(skillId, '<div class="qStory">Mia has ' + a + " stickers. Noah gives her " + b + ' more. How many stickers?</div>', ans, [ans - b, ans + 1, ans - 1], "Add the two groups.", { kind: "word_add" });
  }
  if (skillId === "1.timeHourHalf" || skillId === "2.time5" || skillId === "3.time") {
    const minute = skillId === "1.timeHourHalf" ? pick(r, [0, 30]) : pick(r, [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
    const hour = ri(r, 1, 11);
    if (skillId === "3.time") {
      const elapsed = pick(r, [15, 20, 30, 45]);
      const total = hour * 60 + minute + elapsed;
      return q(skillId, '<div class="qStory">Start at ' + timeText(hour, minute) + ". Add " + elapsed + " minutes.</div>", timeText(Math.floor(total / 60), total % 60), [timeText(hour, minute), timeText(Math.floor((total + 15) / 60), (total + 15) % 60), timeText(Math.floor((total - 5) / 60), (total - 5) % 60)], "Add the minutes first, then adjust the hour.", { kind: "elapsed_time" });
    }
    return q(skillId, '<div class="qBig">' + timeText(hour, minute) + '</div><div class="qSub">Pick the matching time.</div>', timeText(hour, minute), [timeText(hour, (minute + 30) % 60), timeText(hour + 1, minute), timeText(hour, (minute + 5) % 60)], "Read the hour, then the minutes.", { kind: "time" });
  }
  if (skill.group === "Money") {
    const coins = [1, 5, 10, 25];
    a = pick(r, coins); b = pick(r, coins); ans = a + b;
    return q(skillId, '<div class="qStory">A coin worth ' + a + " cents and a coin worth " + b + " cents.</div>", ans + " cents", [a + " cents", b + " cents", ans + 5 + " cents"], "Add the cent values.", { kind: "money", cents: ans });
  }
  if (skill.group === "Data" || skill.group === "Patterns & Data") {
    a = ri(r, 2, 9); b = ri(r, 2, 9); ans = a + b;
    return nq(skillId, '<div class="qStory">Table: apples ' + a + ", oranges " + b + '.</div><div class="qSub">How many fruit in all?</div>', ans, [a, b, ans + 1], "Use the table values.", { kind: "data_total" });
  }
  if (skill.group === "Geometry") {
    if (skillId.includes("area") || skillId === "5.volume") {
      a = ri(r, 2, 8); b = ri(r, 2, 8); c = skillId === "5.volume" ? ri(r, 2, 6) : 1; ans = a * b * c;
      return nq(skillId, '<div class="qStory">' + (skillId === "5.volume" ? "Box" : "Rectangle") + ": " + a + " by " + b + (c > 1 ? " by " + c : "") + '</div><div class="qSub">' + (c > 1 ? "Volume" : "Area") + "?</div>", ans, [a + b + c, a * b, ans + a], "Multiply the side lengths.", { kind: c > 1 ? "volume" : "area" });
    }
    return q(skillId, '<div class="qBig">4 equal sides and 4 square corners</div><div class="qSub">Which shape?</div>', "square", ["triangle", "circle", "pentagon"], "Use the properties.", { kind: "shape_properties" });
  }
  if (skill.group === "Measurement") {
    a = ri(r, 1, 5); ans = a * 12;
    return q(skillId, '<div class="qBig">' + a + ' feet = ? inches</div>', ans + " inches", [(ans + 12) + " inches", a + " inches", Math.max(0, ans - 6) + " inches"], "One foot is 12 inches.", { kind: "unit_conversion" });
  }
  if (skill.group === "Fractions") {
    const den = pick(r, [3, 4, 5, 6, 8, 10, 12]);
    const n1 = ri(r, 1, Math.max(1, den - 1));
    if (skillId.includes("Compare")) {
      const n2 = ri(r, 1, den - 1); ans = n1 > n2 ? frac(n1, den) : frac(n2, den);
      return q(skillId, '<div class="qBig">Which fraction is larger?</div><div class="qSub">' + frac(n1, den) + " or " + frac(n2, den) + "</div>", ans, [frac(Math.min(n1, n2), den), frac(n1 + n2, den), frac(1, den)], "Same denominator: compare numerators.", { kind: "fraction_compare" });
    }
    if (skillId.includes("Ops") || skillId.includes("AddSub")) {
      const n2 = ri(r, 1, den - n1); ans = frac(n1 + n2, den);
      return q(skillId, '<div class="qBig">' + frac(n1, den) + " + " + frac(n2, den) + " = ?</div>", ans, [frac(n1 + n2 + 1, den), frac(n1, den), frac(n2, den)], "Add the numerators.", { kind: "fraction_add" });
    }
    if (skillId.includes("Multiply")) {
      const whole = ri(r, 2, 8); ans = frac(n1 * whole, den);
      return q(skillId, '<div class="qBig">' + whole + " x " + frac(n1, den) + " = ?</div>", ans, [frac(n1 + whole, den), frac(n1, den), frac(whole, den)], "Multiply the numerator by the whole number.", { kind: "fraction_multiply" });
    }
    if (skillId.includes("Divide")) {
      const whole = ri(r, 2, 8); ans = String(whole * den);
      return q(skillId, '<div class="qBig">' + whole + " divided by " + frac(1, den) + " = ?</div>", ans, [whole + den, den, whole], "How many unit fractions fit in the whole number?", { kind: "fraction_divide" });
    }
    ans = frac(n1 * 2, den * 2);
    return q(skillId, '<div class="qBig">' + frac(n1, den) + ' = ?</div><div class="qSub">Pick an equivalent fraction.</div>', ans, [frac(n1 + 1, den), frac(n1, den * 2), frac(n1 * 2 + 1, den * 2)], "Multiply numerator and denominator by the same number.", { kind: "fraction_equiv" });
  }
  if (skill.group === "Decimals" || skillId.includes("Decimals")) {
    a = ri(r, 10, 95); b = ri(r, 1, 40); ans = ((a + b) / 10).toFixed(1);
    return q(skillId, '<div class="qBig">' + (a / 10).toFixed(1) + " + " + (b / 10).toFixed(1) + " = ?</div>", ans, [((a + b + 1) / 10).toFixed(1), ((a + b - 1) / 10).toFixed(1), ((a + b) / 100).toFixed(2)], "Line up place values.", { kind: "decimal_add" });
  }
  if (skill.group === "Probability") {
    a = ri(r, 1, 4); b = ri(r, 2, 6); ans = frac(a, a + b);
    return q(skillId, '<div class="qStory">A bag has ' + a + " red and " + b + " blue cubes.</div><div class=\"qSub\">Chance of red?</div>", ans, [frac(b, a + b), frac(a, b), frac(1, a + b)], "Favorable outcomes over total outcomes.", { kind: "probability" });
  }
  if (skill.group === "Algebraic Thinking" || skill.group === "Logic & Puzzles") {
    a = ri(r, 2, 9); b = ri(r, 2, 9); c = ri(r, 1, 12); ans = a * b + c;
    return nq(skillId, '<div class="qBig">' + a + " x " + b + " + " + c + " = ?</div>", ans, [a * (b + c), ans - c, ans + a], "Multiply before adding.", { kind: "expression" });
  }
  if (skill.group === "Numbers" || skill.group === "Factors") {
    if (skillId.includes("placeValue") || skillId.includes("placeValue1000") || skillId.includes("placeValue100")) {
      const max = gradeNum(skill.grade) >= 2 ? 999 : 99;
      const n = ri(r, 10, max); ans = max >= 100 ? Math.floor(n / 100) : Math.floor(n / 10);
      return nq(skillId, '<div class="qBig">' + n + '</div><div class="qSub">How many ' + (max >= 100 ? "hundreds" : "tens") + "?</div>", ans, [ans + 1, Math.max(0, ans - 1), n % 10], "Read the place-value digit.", { kind: "place_value" });
    }
    a = ri(r, 12, 60); b = ri(r, 2, 10); ans = a % b === 0 ? "yes" : "no";
    return q(skillId, '<div class="qBig">Is ' + a + " a multiple of " + b + "?</div>", ans, ["yes", "no", String(a + b), String(b)], "A multiple divides evenly.", { kind: "multiple" });
  }
  if (skill.group === "Multiplication" || skill.group === "Division" || skill.group === "Operations" || skill.group === "Problem Solving") {
    const g = gradeNum(skill.grade);
    if (skill.group === "Division" || skillId.includes("Division")) {
      b = ri(r, 2, g >= 4 ? 12 : 10); ans = ri(r, 2, g >= 4 ? 30 : 10); a = b * ans;
      return nq(skillId, '<div class="qBig">' + a + " ÷ " + b + " = ?</div>", ans, [ans + 1, Math.max(0, ans - 1), b], "Use the matching multiplication fact.", { kind: "division" });
    }
    if (g <= 2) { a = ri(r, 10, 80); b = ri(r, 5, 90); ans = a + b; return nq(skillId, '<div class="qBig">' + a + " + " + b + " = ?</div>", ans, [ans + 10, ans - 10, ans + 1], "Add by place value.", { kind: "add" }); }
    a = ri(r, 2, g >= 4 ? 35 : 10); b = ri(r, 2, g >= 4 ? 12 : 10); ans = a * b;
    return nq(skillId, '<div class="qBig">' + a + " x " + b + " = ?</div>", ans, [ans + a, Math.max(0, ans - b), a + b], "Think in equal groups.", { kind: "multiply" });
  }
  a = ri(r, 1, 20); b = ri(r, 1, 20); ans = a + b;
  return nq(skillId, '<div class="qBig">' + a + " + " + b + " = ?</div>", ans, [ans + 1, ans - 1, ans + 2], skill.label, { kind: "fallback_add" });
}

function suffix(n) {
  return n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
}

module.exports = { generatePlacementQuestion, hash, rng };
