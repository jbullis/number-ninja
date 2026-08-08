/* Number Ninja K-5 curriculum catalog
 *
 * Primary grade-placement reference: 2022 Oklahoma Academic Standards for Mathematics
 * (current OSDE mathematics standards as of Aug. 2026), cross-checked against the
 * Common Core K-5 progression where concepts overlap.
 *
 * This is intentionally a skill graph, not a linear grade lock. A student's homeGrade
 * determines emphasis; prerequisites determine what may unlock next.
 */
(function (root) {
  "use strict";

  const GRADES = ["K", "1", "2", "3", "4", "5"];

  // evidence = suggested amount of successful evidence before a mastery challenge.
  // challengeMix = fraction of challenge items that should sample prerequisites.
  const S = (id, grade, group, label, prereqs, evidence, opts) => Object.assign({
    id, grade, group, label, prereqs: prereqs || [], evidence: evidence || 12,
    challengeMix: 0.25,
    visual: grade === "K" ? "high" : grade === "1" ? "adaptive" : "low",
    standardRefs: [],
  }, opts || {});

  const SKILLS = [
    // ---------------- Kindergarten ----------------
    S("k.count100", "K", "Numbers", "Count to 100 by ones and tens", [], 10,
      { standardRefs:["OK K.N.1.1"], visual:"high" }),
    S("k.quantity10", "K", "Numbers", "Match quantities to numbers through 10", [], 10,
      { standardRefs:["OK K.N.1.2"], visual:"high" }),
    S("k.ordinal10", "K", "Numbers", "Use ordinal numbers through 10th", ["k.quantity10"], 8,
      { standardRefs:["OK K.N.1.3"], visual:"high" }),
    S("k.subitize10", "K", "Numbers", "Recognize small quantities without counting", ["k.quantity10"], 10,
      { standardRefs:["OK K.N.1.4"], visual:"high" }),
    S("k.countFrom20", "K", "Numbers", "Count forward from any number through 20", ["k.quantity10"], 10,
      { standardRefs:["OK K.N.1.5"], visual:"high" }),
    S("k.readWrite20", "K", "Numbers", "Read, write, and represent 0–20", ["k.quantity10"], 12,
      { standardRefs:["OK K.N.1.6"], visual:"high" }),
    S("k.oneMoreLess10", "K", "Numbers", "Find one more or one less through 10", ["k.quantity10"], 10,
      { standardRefs:["OK K.N.1.7"], visual:"high" }),
    S("k.compare10", "K", "Numbers", "Compare and order numbers 0–10", ["k.quantity10"], 12,
      { standardRefs:["OK K.N.1.8"], visual:"high" }),
    S("k.compose10", "K", "Operations", "Compose and decompose numbers through 10", ["k.quantity10"], 14,
      { standardRefs:["OK K.N.2.1"], visual:"high", challengeMix:0.30 }),
    S("k.addSub10", "K", "Operations", "Model addition and subtraction through 10", ["k.compose10"], 16,
      { standardRefs:["OK K.N.2"], visual:"high", challengeMix:0.35 }),
    S("k.fairShare", "K", "Fractions", "Split objects into equal groups", ["k.quantity10"], 10,
      { standardRefs:["OK K.N.3.1"], visual:"high" }),
    S("k.coins", "K", "Money", "Identify pennies, nickels, dimes, and quarters", [], 10,
      { standardRefs:["OK K.N.4.1"], visual:"high" }),
    S("k.sort", "K", "Patterns & Data", "Sort objects by attributes", [], 8,
      { standardRefs:["OK K.A.1.1"], visual:"high" }),
    S("k.patterns", "K", "Patterns & Data", "Recognize and extend patterns", ["k.sort"], 10,
      { standardRefs:["OK K.A.1.2"], visual:"high" }),
    S("k.measureCompare", "K", "Measurement", "Compare and order measurable attributes", ["k.compare10"], 10,
      { visual:"high" }),
    S("k.shapes", "K", "Geometry", "Identify and describe 2D and 3D shapes", [], 10,
      { visual:"high" }),
    S("k.composeShapes", "K", "Geometry", "Compose larger shapes from smaller shapes", ["k.shapes"], 10,
      { visual:"high" }),
    S("k.logic", "K", "Logic & Puzzles", "Solve visual sorting and pattern puzzles", ["k.patterns"], 8,
      { visual:"high" }),

    // ---------------- Grade 1 ----------------
    S("1.addSub20", "1", "Operations", "Add and subtract within 20", ["k.addSub10"], 18,
      { visual:"adaptive", challengeMix:0.35 }),
    S("1.fluency10", "1", "Operations", "Build fluency within 10", ["k.addSub10"], 18,
      { visual:"adaptive", challengeMix:0.30 }),
    S("1.wordProblems", "1", "Problem Solving", "Solve one-step addition and subtraction stories", ["1.addSub20"], 16,
      { visual:"adaptive", challengeMix:0.35 }),
    S("1.missingNumber", "1", "Algebraic Thinking", "Find the unknown in addition/subtraction equations", ["1.addSub20"], 16,
      { visual:"adaptive" }),
    S("1.placeValue100", "1", "Numbers", "Understand tens and ones through 100", ["k.count100","k.readWrite20"], 18,
      { visual:"adaptive", challengeMix:0.30 }),
    S("1.compare100", "1", "Numbers", "Compare two-digit numbers", ["1.placeValue100","k.compare10"], 14,
      { visual:"adaptive" }),
    S("1.addWithin100", "1", "Operations", "Add within 100 using place-value strategies", ["1.placeValue100","1.addSub20"], 18,
      { visual:"adaptive", challengeMix:0.35 }),
    S("1.measureLength", "1", "Measurement", "Measure and compare lengths", ["k.measureCompare","1.placeValue100"], 12,
      { visual:"adaptive" }),
    S("1.timeHourHalf", "1", "Time", "Tell and write time to hour and half-hour", ["1.placeValue100"], 12,
      { visual:"adaptive" }),
    S("1.data", "1", "Data", "Organize and interpret simple category data", ["k.sort","1.addSub20"], 12,
      { visual:"adaptive" }),
    S("1.geometry", "1", "Geometry", "Compose, partition, and reason about shapes", ["k.composeShapes"], 12,
      { visual:"adaptive" }),
    S("1.fractions", "1", "Fractions", "Partition shapes into halves and fourths", ["1.geometry","k.fairShare"], 12,
      { visual:"adaptive" }),
    S("1.logic", "1", "Logic & Puzzles", "Solve number and visual logic puzzles", ["1.addSub20","k.logic"], 10,
      { visual:"adaptive" }),

    // ---------------- Grade 2 ----------------
    S("2.placeValue1000", "2", "Numbers", "Understand place value through 1,000", ["1.placeValue100"], 18),
    S("2.skipCount", "2", "Numbers", "Skip-count by 2s, 5s, 10s, and 100s", ["1.placeValue100"], 14),
    S("2.addSub100", "2", "Operations", "Fluently add and subtract within 100", ["1.addWithin100"], 20,
      { challengeMix:0.35 }),
    S("2.addSub1000", "2", "Operations", "Add and subtract within 1,000 using strategies", ["2.placeValue1000","2.addSub100"], 20,
      { challengeMix:0.35 }),
    S("2.equalGroups", "2", "Operations", "Model equal groups and repeated addition", ["2.skipCount","1.addSub20"], 14),
    S("2.wordProblems", "2", "Problem Solving", "Solve one- and two-step addition/subtraction problems", ["2.addSub100"], 18,
      { challengeMix:0.35 }),
    S("2.length", "2", "Measurement", "Measure, estimate, and compare length", ["1.measureLength","2.addSub100"], 14),
    S("2.time5", "2", "Time", "Tell time to five minutes", ["1.timeHourHalf","2.skipCount"], 14),
    S("2.money", "2", "Money", "Find values and solve coin/money problems", ["k.coins","2.addSub100"], 14),
    S("2.dataGraphs", "2", "Data", "Read and create picture and bar graphs", ["1.data","2.addSub100"], 14),
    S("2.geometry", "2", "Geometry", "Reason about shapes, rows, columns, halves, thirds, and fourths", ["1.geometry","1.fractions"], 14),
    S("2.logic", "2", "Logic & Puzzles", "Solve multi-clue number puzzles", ["2.addSub100","1.logic"], 12),

    // ---------------- Grade 3 ----------------
    S("3.multiply", "3", "Multiplication", "Understand and solve multiplication facts", ["2.equalGroups","2.skipCount"], 22,
      { challengeMix:0.35 }),
    S("3.divide", "3", "Division", "Understand and solve division facts", ["3.multiply"], 22,
      { challengeMix:0.35 }),
    S("3.fluency", "3", "Multiplication", "Build multiplication/division fact fluency", ["3.multiply","3.divide"], 24,
      { challengeMix:0.35 }),
    S("3.wordProblems", "3", "Problem Solving", "Solve multi-step whole-number word problems", ["3.multiply","3.divide","2.wordProblems"], 20,
      { challengeMix:0.40 }),
    S("3.fractions", "3", "Fractions", "Understand fractions as numbers", ["2.geometry","1.fractions"], 20),
    S("3.compareFractions", "3", "Fractions", "Compare simple fractions", ["3.fractions"], 16),
    S("3.area", "3", "Measurement", "Understand and calculate area", ["3.multiply","2.length"], 16),
    S("3.perimeter", "3", "Measurement", "Understand and calculate perimeter", ["2.length","3.addSubMental"], 16),
    S("3.addSubMental", "3", "Operations", "Use efficient multi-digit addition/subtraction strategies", ["2.addSub1000"], 18),
    S("3.time", "3", "Time", "Solve elapsed-time problems", ["2.time5","3.addSubMental"], 16),
    S("3.data", "3", "Data", "Interpret scaled graphs and measurement data", ["2.dataGraphs","3.multiply"], 16),
    S("3.geometry", "3", "Geometry", "Classify shapes and reason about quadrilaterals", ["2.geometry"], 14),
    S("3.logic", "3", "Logic & Puzzles", "Solve multi-step logic and arithmetic puzzles", ["3.wordProblems","2.logic"], 14),

    // ---------------- Grade 4 ----------------
    S("4.placeValue", "4", "Numbers", "Generalize multi-digit place value", ["2.placeValue1000","3.addSubMental"], 18),
    S("4.multiMultiply", "4", "Multiplication", "Multiply multi-digit whole numbers", ["3.fluency","4.placeValue"], 22,
      { challengeMix:0.35 }),
    S("4.longDivision", "4", "Division", "Divide multi-digit whole numbers", ["3.fluency","4.placeValue"], 22,
      { challengeMix:0.35 }),
    S("4.factorsMultiples", "4", "Factors", "Find factor pairs and multiples", ["3.fluency"], 18),
    S("4.fractionEquiv", "4", "Fractions", "Generate and recognize equivalent fractions", ["3.fractions","3.compareFractions"], 20),
    S("4.fractionCompare", "4", "Fractions", "Compare fractions with different numerators/denominators", ["4.fractionEquiv"], 18),
    S("4.fractionOps", "4", "Fractions", "Add and subtract fractions with like denominators", ["4.fractionEquiv"], 20),
    S("4.decimals", "4", "Decimals", "Relate tenths/hundredths to decimals", ["4.fractionEquiv","4.placeValue"], 18),
    S("4.measurement", "4", "Measurement", "Convert and solve measurement problems", ["3.area","3.perimeter","3.time"], 18),
    S("4.angles", "4", "Geometry", "Measure, draw, add, and subtract angles", ["3.geometry","4.fractionOps"], 18),
    S("4.linesSymmetry", "4", "Geometry", "Classify lines, angles, and symmetry", ["3.geometry"], 14),
    S("4.data", "4", "Data", "Interpret data displays and fraction measurements", ["3.data","4.fractionOps"], 16),
    S("4.wordProblems", "4", "Problem Solving", "Solve multi-step problems using all four operations", ["4.multiMultiply","4.longDivision","3.wordProblems"], 20,
      { challengeMix:0.40 }),
    S("4.logic", "4", "Logic & Puzzles", "Solve multi-step number and pattern puzzles", ["4.wordProblems","3.logic"], 16),

    // ---------------- Grade 5 ----------------
    S("5.placeValueDecimals", "5", "Numbers", "Extend place value through decimals", ["4.placeValue","4.decimals"], 20),
    S("5.operations", "5", "Operations", "Fluently perform multi-digit whole-number operations", ["4.multiMultiply","4.longDivision"], 24,
      { challengeMix:0.35 }),
    S("5.decimalOps", "5", "Decimals", "Add, subtract, multiply, and divide decimals", ["5.placeValueDecimals","5.operations"], 22,
      { challengeMix:0.35 }),
    S("5.fractionAddSub", "5", "Fractions", "Add and subtract fractions with unlike denominators", ["4.fractionOps","4.fractionCompare"], 22),
    S("5.fractionMultiply", "5", "Fractions", "Multiply fractions and interpret products", ["5.fractionAddSub","4.multiMultiply"], 22),
    S("5.fractionDivide", "5", "Fractions", "Divide unit fractions and whole numbers", ["5.fractionMultiply","4.longDivision"], 22),
    S("5.expressions", "5", "Algebraic Thinking", "Write and evaluate numerical expressions", ["5.operations","4.logic"], 18),
    S("5.patterns", "5", "Algebraic Thinking", "Analyze numerical patterns and relationships", ["5.expressions","4.logic"], 18),
    S("5.volume", "5", "Measurement", "Understand and calculate volume", ["4.measurement","4.multiMultiply"], 18),
    S("5.coordinate", "5", "Geometry", "Graph and interpret points in the first quadrant", ["4.linesSymmetry","5.placeValueDecimals"], 16),
    S("5.geometry", "5", "Geometry", "Classify two-dimensional figures hierarchically", ["4.linesSymmetry"], 16),
    S("5.data", "5", "Data", "Interpret data involving fractional measurements", ["4.data","5.fractionAddSub"], 16),
    S("5.probability", "5", "Probability", "Reason about simple chance and outcomes", ["4.fractionCompare","4.data"], 14),
    S("5.wordProblems", "5", "Problem Solving", "Solve multi-step fraction, decimal, and whole-number problems", ["5.decimalOps","5.fractionAddSub","4.wordProblems"], 22,
      { challengeMix:0.40 }),
    S("5.logic", "5", "Logic & Puzzles", "Solve advanced multi-step logic and number puzzles", ["5.expressions","5.wordProblems","4.logic"], 18,
      { challengeMix:0.40 }),
  ];

  const BY_ID = Object.fromEntries(SKILLS.map(s => [s.id, s]));
  const GRADE_INDEX = Object.fromEntries(GRADES.map((g,i) => [g,i]));

  function gradeAtOrBelow(a, b) {
    return GRADE_INDEX[a] <= GRADE_INDEX[b];
  }

  function skillState(skillId, mastery, overrides, options) {
    const skill = BY_ID[skillId];
    if (!skill) return { state:"unknown" };
    mastery = mastery || {};
    overrides = overrides || {};
    options = options || {};

    if (overrides[skillId] === "locked") return { state:"locked", reason:"parent" };
    if (overrides[skillId] === "unlocked") return { state:"unlocked", reason:"parent" };

    const homeGrade = options.homeGrade || "4";
    const allowAboveGrade = options.allowAboveGrade !== false;
    if (!allowAboveGrade && !gradeAtOrBelow(skill.grade, homeGrade)) {
      return { state:"locked", reason:"above_grade_disabled" };
    }

    const missing = skill.prereqs.filter(id => (mastery[id] || 0) < 80);
    if (missing.length) return { state:"locked", reason:"prerequisites", missing };
    return { state:"unlocked", reason:gradeAtOrBelow(skill.grade, homeGrade) ? "home_grade" : "prerequisites_mastered" };
  }

  function unlockedSkills(mastery, overrides, options) {
    return SKILLS.filter(s => skillState(s.id, mastery, overrides, options).state === "unlocked");
  }

  function nextRecommendations(mastery, overrides, options, limit) {
    mastery = mastery || {};
    const homeGrade = (options && options.homeGrade) || "4";
    const homeIdx = GRADE_INDEX[homeGrade];
    const bySkill = options && options.skillMastery && options.skillMastery.bySkill || {};
    const t = Date.now();
    function needsReviewPriority(skillId) {
      const s = bySkill[skillId] || {};
      return s.certified && (s.needsReview || (s.reviewDueAt && s.reviewDueAt <= t)) ? 0 : 1;
    }
    return unlockedSkills(mastery, overrides, options)
      .filter(s => (mastery[s.id] || 0) < 100)
      .sort((a,b) => {
        const ra = needsReviewPriority(a.id), rb = needsReviewPriority(b.id);
        if (ra !== rb) return ra - rb;
        const ma = mastery[a.id] || 0, mb = mastery[b.id] || 0;
        const ga = Math.abs(GRADE_INDEX[a.grade] - homeIdx), gb = Math.abs(GRADE_INDEX[b.grade] - homeIdx);
        return ga - gb || ma - mb || a.label.localeCompare(b.label);
      })
      .slice(0, limit || 6);
  }

  function visualSupport(skillId, masteryValue) {
    const skill = BY_ID[skillId];
    if (!skill) return "low";
    if (skill.visual === "high") return "high";
    if (skill.visual !== "adaptive") return skill.visual;
    const m = Number(masteryValue || 0);
    if (m < 35) return "high";
    if (m < 70) return "medium";
    return "low";
  }

  function placementBands(homeGrade) {
    const i = GRADE_INDEX[homeGrade] == null ? GRADE_INDEX["4"] : GRADE_INDEX[homeGrade];
    return GRADES.filter((_,gi) => gi >= Math.max(0,i-1) && gi <= Math.min(GRADES.length-1,i+1));
  }

  const api = { GRADES, SKILLS, BY_ID, GRADE_INDEX, skillState, unlockedSkills, nextRecommendations, visualSupport, placementBands };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NINJA_CURRICULUM = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
