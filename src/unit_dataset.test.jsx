import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import dataset from "../unit_test/unit_test.json";
import { validateEntry } from "./App.jsx";

describe("unit_test/unit_test.json dataset sweep", () => {
  it("validates every entry and reports grade distribution", () => {
    expect(Array.isArray(dataset)).toBe(true);

    const grades = { clean: 0, pass: 0, fail: 0 };
    const topErrorCodes = new Map();
    const failedEntries = [];
    const labelMismatches = [];
    const seededErrorButPassed = [];
    const seededCleanButFailed = [];
    const expectedResults = [];

    dataset.forEach((entry, idx) => {
      const result = validateEntry(entry, idx, dataset);
      grades[result.grade] += 1;

      const sectionNumber = String(entry["Section Number"] || "");
      const hasCleanLabel = /CLEAN/i.test(sectionNumber);
      const hasInvalidLabel = /INVALID/i.test(sectionNumber);
      const hasSeededErrorLabel = /(?:^|-)E\d{1,2}(?:$|-)/i.test(sectionNumber) || hasInvalidLabel;

      if (hasSeededErrorLabel && result.grade !== "fail") {
        seededErrorButPassed.push({
          entryId: entry["Entry_ID"],
          sectionNumber,
          got: result.grade,
          errors: result.errors.map((e) => e.code),
        });
      }

      if (hasCleanLabel && result.grade === "fail") {
        seededCleanButFailed.push({
          entryId: entry["Entry_ID"],
          sectionNumber,
          errors: result.errors.map((e) => e.code),
        });
      }

      if (hasCleanLabel && result.grade === "fail") {
        labelMismatches.push({
          entryId: entry["Entry_ID"],
          sectionNumber,
          expected: "pass-or-clean",
          got: "fail",
          errors: result.errors.map((e) => e.code),
        });
      }

      if (hasInvalidLabel && result.grade !== "fail") {
        labelMismatches.push({
          entryId: entry["Entry_ID"],
          sectionNumber,
          expected: "fail",
          got: result.grade,
          errors: result.errors.map((e) => e.code),
        });
      }

      if (result.grade === "fail") {
        failedEntries.push({
          idx: idx + 1,
          entryId: entry["Entry_ID"],
          sectionNumber,
          errors: result.errors.map((e) => e.code),
          firstError: result.errors[0]?.msg || "",
        });
      }

      expectedResults.push({
        idx: idx + 1,
        entryId: entry["Entry_ID"],
        sectionNumber,
        expected_grade: result.grade,
        expected_error_codes: result.errors.map((e) => e.code),
        expected_warning_codes: result.warnings.map((w) => w.code),
      });

      result.errors.forEach(({ code }) => {
        topErrorCodes.set(code, (topErrorCodes.get(code) || 0) + 1);
      });
    });

    const errorSummary = [...topErrorCodes.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([code, count]) => `${code}:${count}`)
      .join(", ");

    console.log(
      `[dataset] total=${dataset.length} clean=${grades.clean} pass=${grades.pass} fail=${grades.fail}`
    );
    console.log(`[dataset] top_error_codes=${errorSummary || "none"}`);
    console.log(`[dataset] label_mismatches=${JSON.stringify(labelMismatches)}`);
    console.log(
      `[dataset] seeded_error_but_passed=${JSON.stringify(seededErrorButPassed)}`
    );
    console.log(
      `[dataset] seeded_clean_but_failed=${JSON.stringify(seededCleanButFailed)}`
    );
    console.log(
      `[dataset] first_20_fails=${JSON.stringify(failedEntries.slice(0, 20))}`
    );

    const outputDir = path.resolve("unit_test");
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(
      path.join(outputDir, "expected_results.json"),
      `${JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          source_dataset: "unit_test/unit_test.json",
          summary: {
            total: dataset.length,
            clean: grades.clean,
            pass: grades.pass,
            fail: grades.fail,
          },
          entries: expectedResults,
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    expect(dataset.length).toBe(106);
    expect(grades.clean + grades.pass + grades.fail).toBe(dataset.length);
  });
});
