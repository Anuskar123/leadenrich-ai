import test from "node:test";
import assert from "node:assert/strict";
import { leadsToCsv, paginate } from "./leadUtils.js";
test("CSV quotes commas, newlines, and quotes", () => {
  const csv = leadsToCsv([{ generatedEmail: 'Hello, "team".\nA new line.' }]);
  assert.ok(csv.startsWith('\uFEFF"companyUrl"'));
  assert.ok(csv.includes('"Hello, ""team"".\nA new line."'));
});
test("CSV neutralizes spreadsheet formulas", () => {
  for (const value of [
    "=CMD()",
    "+123",
    "-1",
    "@SUM(1)",
    "  =SUM(1)",
    "\tformula",
  ]) {
    assert.ok(leadsToCsv([{ generatedEmail: value }]).includes(`"'${value}"`));
  }
});
test("Pagination clamps after filters reduce data and handles empty results", () => {
  const rows = Array.from({ length: 23 }, (_, i) => i);
  assert.deepEqual(paginate(rows, 3).items, [20, 21, 22]);
  assert.equal(paginate(rows.slice(0, 2), 3).current, 1);
  assert.deepEqual(paginate([], 5), { current: 1, pages: 1, items: [] });
});
