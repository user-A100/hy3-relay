import { createHash } from "node:crypto";

import type { RelayRequest } from "../shared/contracts.js";

type RedactionType =
  | "api-key"
  | "bearer-token"
  | "github-token"
  | "cloud-key"
  | "local-path"
  | "secret-assignment";

const rules: Array<{
  type: RedactionType;
  pattern: RegExp;
  replacement: string;
}> = [
  {
    type: "bearer-token",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
    replacement: "Bearer [REDACTED_TOKEN]",
  },
  {
    type: "github-token",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
    replacement: "[REDACTED_GITHUB_TOKEN]",
  },
  {
    type: "cloud-key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: "[REDACTED_CLOUD_KEY]",
  },
  {
    type: "api-key",
    pattern: /\bsk-[A-Za-z0-9_-]{12,}\b/g,
    replacement: "[REDACTED_API_KEY]",
  },
  {
    type: "secret-assignment",
    pattern:
      /\b(api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?(?!\[REDACTED_)([^\s"',;]{12,})["']?/gi,
    replacement: "$1=[REDACTED_SECRET]",
  },
  {
    type: "local-path",
    pattern: /\b[A-Za-z]:\\Users\\[^\\\s"'`]+/g,
    replacement: "%USERPROFILE%",
  },
  {
    type: "local-path",
    pattern: /\/(?:Users|home)\/[^/\s"'`]+/g,
    replacement: "~",
  },
];

export interface SanitizedRequest {
  request: RelayRequest;
  inputHash: string;
  redactions: Array<{ type: RedactionType; count: number }>;
}

export function redactText(input: string): {
  text: string;
  findings: Map<RedactionType, number>;
} {
  let text = input;
  const findings = new Map<RedactionType, number>();

  for (const rule of rules) {
    const count = text.match(rule.pattern)?.length ?? 0;
    text = text.replace(rule.pattern, rule.replacement);
    if (count > 0) {
      findings.set(rule.type, (findings.get(rule.type) ?? 0) + count);
    }
  }

  return { text, findings };
}

export function sanitizeRequest(request: RelayRequest): SanitizedRequest {
  const totals = new Map<RedactionType, number>();
  const materials = request.materials.map((material) => {
    const result = redactText(material.content);
    for (const [type, count] of result.findings) {
      totals.set(type, (totals.get(type) ?? 0) + count);
    }
    return {
      ...material,
      content: result.text,
    };
  });

  const goalResult = redactText(request.goal);
  for (const [type, count] of goalResult.findings) {
    totals.set(type, (totals.get(type) ?? 0) + count);
  }

  const sanitized = {
    ...request,
    goal: goalResult.text,
    materials,
  };

  const canonicalInput = JSON.stringify(sanitized);
  const inputHash = createHash("sha256").update(canonicalInput).digest("hex");

  return {
    request: sanitized,
    inputHash,
    redactions: [...totals.entries()].map(([type, count]) => ({ type, count })),
  };
}
