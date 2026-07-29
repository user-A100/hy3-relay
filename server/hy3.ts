import { relayAnalysisSchema, type RelayAnalysis, type RelayRequest } from "../shared/contracts.js";
import { buildMessages } from "./prompt.js";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export type Hy3ClientOptions = {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export async function analyzeWithHy3(
  request: RelayRequest,
  options: Hy3ClientOptions = {},
): Promise<{
  analysis: RelayAnalysis;
  providerRequestIdPresent: boolean;
}> {
  const apiKey = options.apiKey ?? process.env.HY3_API_KEY;
  const endpoint =
    options.endpoint ??
    process.env.HY3_BASE_URL ??
    "https://tokenhub-intl.tencentcloudmaas.com/v1";
  const model = options.model ?? process.env.HY3_MODEL ?? "hy3";
  const timeoutMs =
    options.timeoutMs ??
    Number.parseInt(process.env.HY3_TIMEOUT_MS ?? "120000", 10);
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!apiKey) {
    throw new ProviderError(
      "未配置 Hy3 API Key。请先运行本地密钥设置。",
      503,
      "HY3_KEY_MISSING",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(
      `${endpoint.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: buildMessages(request),
          temperature: 0.2,
          max_tokens: 5_000,
          stream: false,
          chat_template_kwargs: {
            reasoning_effort: "high",
          },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw statusError(response.status);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new ProviderError(
        "Hy3 返回了空内容。",
        502,
        "HY3_EMPTY_RESPONSE",
      );
    }

    const parsed = parseJson(content);
    const analysis = relayAnalysisSchema.safeParse(parsed);
    if (!analysis.success) {
      throw new ProviderError(
        "Hy3 已响应，但交接结构未通过校验。",
        502,
        "HY3_SCHEMA_INVALID",
      );
    }

    return {
      analysis: analysis.data,
      providerRequestIdPresent: [
        "x-request-id",
        "request-id",
        "x-tencent-request-id",
      ].some((header) => response.headers.has(header)),
    };
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError(
        `Hy3 在 ${Math.round(timeoutMs / 1000)} 秒内没有完成分析。`,
        504,
        "HY3_TIMEOUT",
      );
    }
    throw new ProviderError(
      "无法连接 Hy3，请检查网络和 TokenHub 端点。",
      502,
      "HY3_NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(content: string): unknown {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(withoutFence);
  } catch {
    throw new ProviderError(
      "Hy3 已响应，但结果不是合法 JSON。",
      502,
      "HY3_JSON_INVALID",
    );
  }
}

function statusError(status: number): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError(
      "Hy3 鉴权失败，请检查 Key 是否属于当前国际端点。",
      401,
      "HY3_AUTH_FAILED",
    );
  }
  if (status === 429) {
    return new ProviderError(
      "Hy3 请求过于频繁，请稍后重试。",
      429,
      "HY3_RATE_LIMITED",
    );
  }
  return new ProviderError(
    `Hy3 请求失败（HTTP ${status}）。`,
    502,
    "HY3_UPSTREAM_ERROR",
  );
}
