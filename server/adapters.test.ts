import { describe, expect, it } from "vitest";

import type { ToolId } from "../shared/contracts.js";
import { buildHandoffPrompt, toMarkdownExport } from "./adapters.js";
import { offlineAnalysis } from "./offline.js";

const targets: Array<[ToolId, string, string]> = [
  ["codebuddy", "CodeBuddy", "写文件或执行命令前说明预期影响"],
  ["cursor", "Cursor", "Ask 模式"],
  ["aider", "Aider", "/add"],
  ["cline", "Cline", "Plan 模式"],
  ["continue", "Continue", "Chat 中确认"],
  ["opencode", "OpenCode", "切换 Build"],
];

describe("target tool adapters", () => {
  it.each(targets)(
    "creates a specific handoff for %s",
    (target, displayName, instruction) => {
      const prompt = buildHandoffPrompt(offlineAnalysis, target);

      expect(prompt).toContain(`# ${displayName} 继续任务`);
      expect(prompt).toContain(instruction);
      expect(prompt).toContain("## 已确认事实");
      expect(prompt).toContain("## 未决问题与未知项");
      expect(prompt).toContain("验证：");
    },
  );

  it("exports reproducible metadata without embedding a secret", () => {
    const inputHash = "a".repeat(64);
    const markdown = toMarkdownExport(
      offlineAnalysis,
      "opencode",
      inputHash,
    );

    expect(markdown).toContain("generator: Hy3 Relay");
    expect(markdown).toContain("model: hy3");
    expect(markdown).toContain(`input_sha256: ${inputHash}`);
    expect(markdown).not.toMatch(/sk-[A-Za-z0-9_-]{12,}/);
  });
});
