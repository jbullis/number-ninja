# Question Audit

Phase 5C validates the server-authoritative K-5 question path used by ordinary
practice, placement, mastery, and assignments.

## Coverage

- Curriculum skills: 85
- Grades represented: K, 1, 2, 3, 4, 5
- Server generator coverage: 100%
- Automated sample size: 100 questions per skill in `phase5cfinaltest.js`
- Total automated audit questions: 8,500

## Automated Checks

For every generated sample:

- A question object is returned for the requested skill.
- The public shape has `qHTML`, `tip`, and choices.
- There is exactly one correct choice.
- Choice labels are distinct.
- The question and choices do not contain `undefined`, `NaN`, or infinity values.
- Generated HTML rejects obvious script tags, event handlers, and `javascript:` URLs.
- Kindergarten samples avoid abstract multiply/divide notation.
- Fraction samples avoid zero denominators.
- Decimal samples avoid floating-point display artifacts.

## Grade Quality Notes

Kindergarten:

- Uses counting, comparison, equal groups, shapes, sorting, and pattern prompts.
- Keeps numbers small and uses visual scaffolds where useful.
- Audio defaults remain on for new K accounts.

Grade 1:

- Uses small addition/subtraction, place value, time, measurement, data, and shape
  prompts.
- Visual support remains adaptive and fades with mastery.

Grades 2-3:

- Adds larger place value, regrouping-style operations, equal groups,
  multiplication/division, elapsed time, area/perimeter, fractions, data, and
  multi-step reasoning.

Grades 4-5:

- Includes multi-digit operations, fractions, decimals, measurement conversions,
  geometry, expressions, probability, data, and word-problem style prompts.

## Known Limits

- The original Workbook Quest still uses the legacy workbook table and builder.
  `wbtest.js` independently recomputes workbook answers.
- Some server prompts are representative domain checks rather than a full
  standards-item bank. They are release-safe for practice and assessment flow
  integrity, but future curriculum refinement can add richer variants.
- Generated `qHTML` is internal, not user-authored. Phase 5C still validates it
  against script/event/URL injection patterns.
