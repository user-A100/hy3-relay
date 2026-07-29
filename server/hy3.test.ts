import { describe, expect, it } from "vitest";

import type { RelayRequest } from "../shared/contracts.js";
import { offlineAnalysis } from "./offline.js";
import { analyzeWithHy3 } from "./hy3.js";

const request: RelayRequest = {
  mode: "live",
  sourceTool: "codebuddy",
  targetTool: "aider",
  goal: "修复复合时长解析并继续验证",
  materials: [
    {
      name: "duration.js",
      kind: "text",
      content: "const match = /^(\\d+)([hms])$/.exec(input);",
    },
    {
      name: "duration.test.js",
      kind: "text",
      content: 'assert.equal(parseDuration("1h30m"), 5400);',
    },
  ],
};

function responseWithContent(
  content: unknown,
  headers?: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    },
  );
}

describe("Hy3 provider boundary", () => {
  it("accepts a valid structured response and detects a request id", async () => {
    const result = await analyzeWithHy3(request, {
      apiKey: "test-key",
      fetchImpl: async () =>
        responseWithContent(JSON.stringify(offlineAnalysis), {
          "x-request-id": "request-present",
        }),
    });

    expect(result.analysis.goal).toBe(offlineAnalysis.goal);
    expect(result.providerRequestIdPresent).toBe(true);
  });

  it.each([
    [401, "HY3_AUTH_FAILED"],
    [403, "HY3_AUTH_FAILED"],
    [429, "HY3_RATE_LIMITED"],
    [500, "HY3_UPSTREAM_ERROR"],
  ])("maps HTTP %i to %s", async (status, code) => {
    await expect(
      analyzeWithHy3(request, {
        apiKey: "test-key",
        fetchImpl: async () => new Response("", { status }),
      }),
    ).rejects.toMatchObject({ code });
  });

  it("rejects malformed JSON instead of guessing", async () => {
    await expect(
      analyzeWithHy3(request, {
        apiKey: "test-key",
        fetchImpl: async () => responseWithContent("{not-json"),
      }),
    ).rejects.toMatchObject({ code: "HY3_JSON_INVALID" });
  });

  it("rejects JSON that does not satisfy the handoff schema", async () => {
    await expect(
      analyzeWithHy3(request, {
        apiKey: "test-key",
        fetchImpl: async () => responseWithContent("{}"),
      }),
    ).rejects.toMatchObject({ code: "HY3_SCHEMA_INVALID" });
  });

  it("reports a deterministic timeout", async () => {
    const fetchImpl = ((_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      })) as typeof fetch;

    await expect(
      analyzeWithHy3(request, {
        apiKey: "test-key",
        timeoutMs: 5,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "HY3_TIMEOUT" });
  });

  it("does not silently replace a network failure with offline output", async () => {
    await expect(
      analyzeWithHy3(request, {
        apiKey: "test-key",
        fetchImpl: async () => {
          throw new Error("network down");
        },
      }),
    ).rejects.toMatchObject({ code: "HY3_NETWORK_ERROR" });
  });
});
