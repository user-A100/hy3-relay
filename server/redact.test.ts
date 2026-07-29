import { describe, expect, it } from "vitest";

import type { RelayRequest } from "../shared/contracts.js";
import { redactText, sanitizeRequest } from "./redact.js";

describe("redactText", () => {
  it("removes key-shaped values, bearer tokens, and local user paths", () => {
    const apiKey = ["sk", "exampleSecretValue123456789"].join("-");
    const input = [
      `api_key=${apiKey}`,
      "Authorization: Bearer token.value.that.should.not.leave",
      String.raw`D:\Users\demo-user\private-repo\file.ts`,
    ].join("\n");

    const result = redactText(input);

    expect(result.text).not.toContain(apiKey);
    expect(result.text).not.toContain("demo-user");
    expect(result.text).toContain("[REDACTED_API_KEY]");
    expect(result.text).toContain("Bearer [REDACTED_TOKEN]");
    expect(result.text).toContain("%USERPROFILE%");
  });

  it("produces a stable hash for the sanitized request", () => {
    const request: RelayRequest = {
      mode: "offline",
      sourceTool: "codebuddy",
      targetTool: "aider",
      goal: "继续修复解析错误",
      materials: [
        {
          name: "notes.md",
          kind: "markdown",
          content: "现有测试失败。",
        },
      ],
    };

    expect(sanitizeRequest(request).inputHash).toEqual(
      sanitizeRequest(request).inputHash,
    );
  });
});
