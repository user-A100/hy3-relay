import { describe, expect, it } from "vitest";

import { buildHandoffPrompt, toMarkdownExport } from "./adapters.js";
import { verifyEvidence } from "./evidence.js";
import { offlineAnalysis } from "./offline.js";

const materials = [
  {
    name: "duration.js",
    content: "const match = /^(\\d+)([hms])$/.exec(input);",
  },
  {
    name: "duration.test.js",
    content: 'assert.equal(parseDuration("1h30m"), 5400);',
  },
];

describe("evidence and adapters", () => {
  it("verifies exact source excerpts after whitespace normalization", () => {
    expect(verifyEvidence(offlineAnalysis, materials)).toEqual({
      verified: 2,
      unverified: 0,
    });
  });

  it("marks missing source excerpts as unverified", () => {
    expect(verifyEvidence(offlineAnalysis, materials.slice(0, 1))).toEqual({
      verified: 1,
      unverified: 1,
    });
  });

  it("builds a target-specific handoff without another model call", () => {
    const prompt = buildHandoffPrompt(offlineAnalysis, "aider");
    expect(prompt).toContain("# Aider 继续任务");
    expect(prompt).toContain("/add");
    expect(prompt).toContain("npm test");

    const markdown = toMarkdownExport(
      offlineAnalysis,
      "aider",
      "a".repeat(64),
    );
    expect(markdown).toContain("input_sha256:");
    expect(markdown).toContain("target: aider");
  });
});
