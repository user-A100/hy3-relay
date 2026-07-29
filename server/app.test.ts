import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { RelayRequest } from "../shared/contracts.js";
import { createApp } from "./app.js";

let server: Server;
let baseUrl: string;

const request: RelayRequest = {
  mode: "offline",
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

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createApp().listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Test server did not expose a TCP port.");
      }
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("local API", () => {
  it("reports health without exposing a key", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      model: "hy3",
      retention: "memory-only",
    });
    expect(JSON.stringify(payload)).not.toContain("Bearer");
  });

  it("previews sanitized input before a model call", async () => {
    const response = await fetch(`${baseUrl}/api/preflight`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const payload = (await response.json()) as {
      inputHash: string;
      sanitizedMaterials: unknown[];
    };

    expect(response.status).toBe(200);
    expect(payload.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.sanitizedMaterials).toHaveLength(2);
  });

  it("runs the complete offline relay and verifies evidence", async () => {
    const response = await fetch(`${baseUrl}/api/relay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const payload = (await response.json()) as {
      mode: string;
      evidence: { verified: number; unverified: number };
      handoffPrompt: string;
    };

    expect(response.status).toBe(200);
    expect(payload.mode).toBe("offline");
    expect(payload.evidence).toEqual({ verified: 2, unverified: 0 });
    expect(payload.handoffPrompt).toContain("Aider 继续任务");
  });

  it("does not silently use offline output in live mode without a key", async () => {
    const response = await fetch(`${baseUrl}/api/relay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, mode: "live" }),
    });
    const payload = (await response.json()) as { code: string };

    expect(response.status).toBe(503);
    expect(payload.code).toBe("HY3_KEY_MISSING");
  });
});
