import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  preflightResponseSchema,
  relayRequestSchema,
  relayResponseSchema,
} from "../shared/contracts.js";
import { buildHandoffPrompt, toMarkdownExport } from "./adapters.js";
import { verifyEvidence } from "./evidence.js";
import { analyzeWithHy3, ProviderError } from "./hy3.js";
import { offlineAnalysis } from "./offline.js";
import { sanitizeRequest } from "./redact.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "500kb" }));

  app.get("/api/health", (_request, response) => {
    response.json({
      ok: true,
      model: process.env.HY3_MODEL ?? "hy3",
      liveConfigured: Boolean(process.env.HY3_API_KEY),
      retention: "memory-only",
    });
  });

  app.post("/api/preflight", (request, response) => {
    const parsed = relayRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        code: "INPUT_INVALID",
        message: "输入不完整或超过限制，请检查目标、材料类型和文件大小。",
      });
      return;
    }

    const sanitized = sanitizeRequest(parsed.data);
    response.json(
      preflightResponseSchema.parse({
        inputHash: sanitized.inputHash,
        redactions: sanitized.redactions,
        sanitizedGoal: sanitized.request.goal,
        sanitizedMaterials: sanitized.request.materials,
      }),
    );
  });

  app.post("/api/relay", async (request, response) => {
    const parsed = relayRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        code: "INPUT_INVALID",
        message: "输入不完整或超过限制，请检查目标、材料类型和文件大小。",
      });
      return;
    }

    try {
      const sanitized = sanitizeRequest(parsed.data);
      const provider =
        parsed.data.mode === "live"
          ? await analyzeWithHy3(sanitized.request)
          : {
              analysis: offlineAnalysis,
              providerRequestIdPresent: false,
            };
      const evidence = verifyEvidence(
        provider.analysis,
        sanitized.request.materials,
      );
      const handoffPrompt = buildHandoffPrompt(
        provider.analysis,
        parsed.data.targetTool,
      );

      const payload = relayResponseSchema.parse({
        mode: parsed.data.mode,
        model: "hy3",
        inputHash: sanitized.inputHash,
        redactions: sanitized.redactions,
        analysis: provider.analysis,
        evidence,
        targetTool: parsed.data.targetTool,
        handoffPrompt,
        generatedAt: new Date().toISOString(),
        providerRequestIdPresent: provider.providerRequestIdPresent,
      });
      response.json(payload);
    } catch (error) {
      if (error instanceof ProviderError) {
        response.status(error.status).json({
          code: error.code,
          message: error.message,
        });
        return;
      }
      response.status(500).json({
        code: "INTERNAL_ERROR",
        message: "本地处理失败，输入没有被保存。",
      });
    }
  });

  app.post("/api/export/markdown", (request, response) => {
    const parsed = relayResponseSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        code: "EXPORT_INPUT_INVALID",
        message: "交接结果无效，无法导出。",
      });
      return;
    }

    response
      .type("text/markdown")
      .send(
        toMarkdownExport(
          parsed.data.analysis,
          parsed.data.targetTool,
          parsed.data.inputHash,
        ),
      );
  });

  if (process.env.NODE_ENV === "production") {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const dist = path.resolve(here, "..", "dist");
    app.use(express.static(dist, { index: false }));
    app.get("*splat", (_request, response) => {
      response.sendFile(path.join(dist, "index.html"));
    });
  }

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof SyntaxError) {
        response.status(400).json({
          code: "JSON_INVALID",
          message: "请求 JSON 无效。",
        });
        return;
      }
      response.status(500).json({
        code: "INTERNAL_ERROR",
        message: "本地服务发生错误。",
      });
    },
  );

  return app;
}
