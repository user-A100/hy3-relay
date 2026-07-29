import { z } from "zod";

export const toolIdSchema = z.enum([
  "codebuddy",
  "cursor",
  "aider",
  "cline",
  "continue",
  "opencode",
]);

export type ToolId = z.infer<typeof toolIdSchema>;

export const materialSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["text", "markdown", "json", "diff", "patch"]),
  content: z.string().min(1).max(120_000),
});

export const relayRequestSchema = z.object({
  mode: z.enum(["live", "offline"]),
  sourceTool: toolIdSchema,
  targetTool: toolIdSchema,
  goal: z.string().trim().min(5).max(1_000),
  materials: z.array(materialSchema).min(1).max(8),
});

export type RelayRequest = z.infer<typeof relayRequestSchema>;

export const preflightResponseSchema = z.object({
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  redactions: z.array(
    z.object({
      type: z.enum([
        "api-key",
        "bearer-token",
        "github-token",
        "cloud-key",
        "local-path",
        "secret-assignment",
      ]),
      count: z.number().int().positive(),
    }),
  ),
  sanitizedGoal: z.string(),
  sanitizedMaterials: z.array(materialSchema),
});

export type PreflightResponse = z.infer<typeof preflightResponseSchema>;

const evidenceSchema = z.object({
  statement: z.string().trim().min(1).max(1_000),
  source: z.string().trim().min(1).max(120),
  evidence: z.string().trim().min(1).max(500),
});

export const relayAnalysisSchema = z.object({
  goal: z.string().trim().min(1).max(1_000),
  completed: z.array(z.string().trim().min(1).max(500)).max(20),
  facts: z.array(evidenceSchema).max(20),
  decisions: z
    .array(
      z.object({
        decision: z.string().trim().min(1).max(500),
        reason: z.string().trim().min(1).max(500),
      }),
    )
    .max(15),
  files: z.array(z.string().trim().min(1).max(300)).max(30),
  failedAttempts: z.array(z.string().trim().min(1).max(500)).max(15),
  openQuestions: z.array(z.string().trim().min(1).max(500)).max(15),
  risks: z.array(z.string().trim().min(1).max(500)).max(15),
  nextActions: z
    .array(
      z.object({
        action: z.string().trim().min(1).max(500),
        verify: z.string().trim().min(1).max(500),
      }),
    )
    .min(1)
    .max(15),
  unknowns: z.array(z.string().trim().min(1).max(500)).max(15),
});

export type RelayAnalysis = z.infer<typeof relayAnalysisSchema>;

export const redactionFindingSchema = z.object({
  type: z.enum([
    "api-key",
    "bearer-token",
    "github-token",
    "cloud-key",
    "local-path",
    "secret-assignment",
  ]),
  count: z.number().int().positive(),
});

export const relayResponseSchema = z.object({
  mode: z.enum(["live", "offline"]),
  model: z.literal("hy3"),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  redactions: z.array(redactionFindingSchema),
  analysis: relayAnalysisSchema,
  evidence: z.object({
    verified: z.number().int().nonnegative(),
    unverified: z.number().int().nonnegative(),
  }),
  targetTool: toolIdSchema,
  handoffPrompt: z.string().min(1),
  generatedAt: z.string().datetime(),
  providerRequestIdPresent: z.boolean(),
});

export type RelayResponse = z.infer<typeof relayResponseSchema>;
