import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import {
  preflightResponseSchema,
  relayResponseSchema,
  type PreflightResponse,
  type RelayRequest,
  type RelayResponse,
  type ToolId,
} from "../shared/contracts";

const tools: Array<{ id: ToolId; name: string; short: string }> = [
  { id: "codebuddy", name: "CodeBuddy", short: "CB" },
  { id: "cursor", name: "Cursor", short: "CU" },
  { id: "aider", name: "Aider", short: "AI" },
  { id: "cline", name: "Cline", short: "CL" },
  { id: "continue", name: "Continue", short: "CO" },
  { id: "opencode", name: "OpenCode", short: "OC" },
];

const sampleMaterials: RelayRequest["materials"] = [
  {
    name: "duration.js",
    kind: "text",
    content: `const UNIT_SECONDS = { h: 3600, m: 60, s: 1 };

export function parseDuration(value) {
  const input = value.trim();
  const match = /^(\\d+)([hms])$/.exec(input);
  if (!match) throw new Error(\`Invalid duration: \${value}\`);
  return Number.parseInt(match[1], 10) * UNIT_SECONDS[match[2]];
}`,
  },
  {
    name: "duration.test.js",
    kind: "text",
    content: `assert.equal(parseDuration("45s"), 45);
assert.equal(parseDuration("1h30m"), 5400);
assert.equal(parseDuration("2m10s"), 130);
assert.throws(() => parseDuration("1h20h"), /Invalid duration/);
assert.throws(() => parseDuration("30m1h"), /Invalid duration/);`,
  },
];

const redactionNames: Record<string, string> = {
  "api-key": "API Key",
  "bearer-token": "Bearer Token",
  "github-token": "GitHub Token",
  "cloud-key": "云访问密钥",
  "local-path": "本机路径",
  "secret-assignment": "敏感字段",
};

type Health = {
  ok: boolean;
  model: string;
  liveConfigured: boolean;
  retention: string;
};

type AppError = {
  code: string;
  message: string;
};

function App() {
  const [mode, setMode] = useState<"live" | "offline">("offline");
  const [sourceTool, setSourceTool] = useState<ToolId>("codebuddy");
  const [targetTool, setTargetTool] = useState<ToolId>("aider");
  const [goal, setGoal] = useState(
    "修复复合时长解析，并让目标工具从已有进度继续完成测试。",
  );
  const [materials, setMaterials] =
    useState<RelayRequest["materials"]>(sampleMaterials);
  const [selectedMaterial, setSelectedMaterial] = useState(0);
  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  const [result, setResult] = useState<RelayResponse | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [stage, setStage] = useState(0);
  const [busy, setBusy] = useState<"preflight" | "relay" | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((payload: Health) => setHealth(payload))
      .catch(() => setHealth(null));
  }, []);

  const request = useMemo<RelayRequest>(
    () => ({
      mode,
      sourceTool,
      targetTool,
      goal,
      materials,
    }),
    [goal, materials, mode, sourceTool, targetTool],
  );

  const activeMaterial = materials[selectedMaterial] ?? materials[0];
  const sanitizedActive =
    preflight?.sanitizedMaterials.find(
      (material) => material.name === activeMaterial?.name,
    ) ?? preflight?.sanitizedMaterials[0];

  function markDirty() {
    setPreflight(null);
    setResult(null);
    setStage(0);
    setError(null);
  }

  async function runPreflight(): Promise<PreflightResponse | null> {
    setBusy("preflight");
    setError(null);
    setResult(null);
    setStage(1);
    try {
      const response = await fetch("/api/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw payload as AppError;
      }
      const parsed = preflightResponseSchema.parse(payload);
      setPreflight(parsed);
      setStage(2);
      return parsed;
    } catch (caught) {
      setStage(0);
      setError(normalizeError(caught, "材料检查失败。"));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function runRelay() {
    if (!preflight) {
      setError({
        code: "PREFLIGHT_REQUIRED",
        message: "先检查材料，确认脱敏预览后再交给 Hy3。",
      });
      return;
    }

    setBusy("relay");
    setError(null);
    setStage(3);
    try {
      const response = await fetch("/api/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw payload as AppError;
      }
      const parsed = relayResponseSchema.parse(payload);
      if (parsed.inputHash !== preflight.inputHash) {
        throw {
          code: "INPUT_CHANGED",
          message: "材料在检查后发生变化，请重新检查。",
        };
      }
      setResult(parsed);
      setStage(4);
    } catch (caught) {
      setStage(2);
      setError(normalizeError(caught, "交接生成失败。"));
    } finally {
      setBusy(null);
    }
  }

  function updateMaterial(content: string) {
    setMaterials((current) =>
      current.map((material, index) =>
        index === selectedMaterial ? { ...material, content } : material,
      ),
    );
    markDirty();
  }

  async function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const accepted: RelayRequest["materials"] = [];
    for (const file of files.slice(0, 8)) {
      if (file.size > 120_000) {
        setError({
          code: "FILE_TOO_LARGE",
          message: `${file.name} 超过 120 KB，没有导入。`,
        });
        continue;
      }
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (
        !["md", "txt", "json", "diff", "patch", "js", "ts", "tsx"].includes(
          extension ?? "",
        )
      ) {
        setError({
          code: "FILE_TYPE_BLOCKED",
          message: `${file.name} 不是允许的文本类型。`,
        });
        continue;
      }
      accepted.push({
        name: file.name,
        kind:
          extension === "md"
            ? "markdown"
            : extension === "json"
              ? "json"
              : extension === "diff"
                ? "diff"
                : extension === "patch"
                  ? "patch"
                  : "text",
        content: await file.text(),
      });
    }
    if (accepted.length > 0) {
      setMaterials(accepted);
      setSelectedMaterial(0);
      markDirty();
    }
    event.target.value = "";
  }

  function removeMaterial(index: number) {
    if (materials.length === 1) {
      setError({
        code: "MATERIAL_REQUIRED",
        message: "至少保留一份来源材料。",
      });
      return;
    }
    setMaterials((current) => current.filter((_, item) => item !== index));
    setSelectedMaterial(0);
    markDirty();
  }

  async function copyHandoff() {
    if (!result) return;
    await navigator.clipboard.writeText(result.handoffPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function exportJson() {
    if (!result) return;
    download(
      "hy3-relay-handoff.json",
      JSON.stringify(result, null, 2),
      "application/json",
    );
  }

  async function exportMarkdown() {
    if (!result) return;
    const response = await fetch("/api/export/markdown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
    if (!response.ok) {
      setError({
        code: "EXPORT_FAILED",
        message: "Markdown 导出失败，请保留当前页面后重试。",
      });
      return;
    }
    download(
      "hy3-relay-handoff.md",
      await response.text(),
      "text/markdown",
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="Hy3 Relay">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div>
            <strong>HY3 RELAY</strong>
            <span>上下文接力站</span>
          </div>
        </div>

        <div className="mode-switch" aria-label="运行模式">
          <button
            className={mode === "live" ? "active live" : ""}
            onClick={() => {
              setMode("live");
              markDirty();
            }}
            type="button"
          >
            <span className="status-dot" />
            真实 Hy3
          </button>
          <button
            className={mode === "offline" ? "active" : ""}
            onClick={() => {
              setMode("offline");
              markDirty();
            }}
            type="button"
          >
            离线样例
          </button>
        </div>

        <div className="system-status">
          <span>
            模型 <b>hy3</b>
          </span>
          <span>
            保留策略 <b>仅内存</b>
          </span>
          <span className={health?.liveConfigured ? "ready" : "waiting"}>
            {health?.liveConfigured ? "密钥就绪" : "等待本地密钥"}
          </span>
        </div>
      </header>

      {mode === "offline" && (
        <div className="offline-banner" role="status">
          当前是离线固定样例，不会调用模型。它只用于无 Key 复现界面和测试。
        </div>
      )}

      <section className="dispatch-board">
        <section className="bay source-bay" aria-labelledby="source-title">
          <div className="section-heading">
            <span>来源舱 / SOURCE BAY</span>
            <b id="source-title">把已有进度装上车</b>
          </div>

          <label className="field-label" htmlFor="source-tool">
            来源工具
          </label>
          <ToolSelect
            id="source-tool"
            value={sourceTool}
            onChange={(value) => {
              setSourceTool(value);
              markDirty();
            }}
          />

          <label className="field-label" htmlFor="relay-goal">
            本次接力目标
          </label>
          <textarea
            id="relay-goal"
            className="goal-input"
            value={goal}
            onChange={(event) => {
              setGoal(event.target.value);
              markDirty();
            }}
            rows={3}
          />

          <div className="materials-head">
            <span className="field-label">来源材料</span>
            <button
              className="text-action"
              onClick={() => fileInput.current?.click()}
              type="button"
            >
              + 导入文本文件
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".md,.txt,.json,.diff,.patch,.js,.ts,.tsx"
              multiple
              hidden
              onChange={importFiles}
            />
          </div>

          <div className="material-tabs" role="tablist">
            {materials.map((material, index) => (
              <button
                key={`${material.name}-${index}`}
                className={index === selectedMaterial ? "selected" : ""}
                onClick={() => setSelectedMaterial(index)}
                type="button"
                role="tab"
                aria-selected={index === selectedMaterial}
              >
                <span>{material.name}</span>
                <small>{Math.ceil(material.content.length / 1024)} KB</small>
                <i
                  role="button"
                  tabIndex={0}
                  aria-label={`移除 ${material.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    removeMaterial(index);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") removeMaterial(index);
                  }}
                >
                  ×
                </i>
              </button>
            ))}
          </div>

          <label className="editor-shell">
            <span>原始内容 / LOCAL</span>
            <textarea
              value={activeMaterial?.content ?? ""}
              onChange={(event) => updateMaterial(event.target.value)}
              spellCheck={false}
              aria-label="来源材料内容"
            />
          </label>

          <div className="source-foot">
            <span>最多 8 份</span>
            <span>每份 ≤ 120 KB</span>
            <span>发送前可预览</span>
          </div>
        </section>

        <section className="relay-track" aria-labelledby="track-title">
          <div className="section-heading">
            <span>接力轨道 / RELAY TRACK</span>
            <b id="track-title">每一站都有证据</b>
          </div>

          <ol className={`track stage-${stage}`}>
            <TrackStep
              number="01"
              title="接收"
              detail={`${materials.length} 份材料 · ${totalSize(materials)} KB`}
              state={stepState(stage, 1)}
            />
            <TrackStep
              number="02"
              title="脱敏"
              detail={
                preflight
                  ? `${sumRedactions(preflight)} 项已处理`
                  : "等待本地检查"
              }
              state={stepState(stage, 2)}
            />
            <TrackStep
              number="03"
              title="Hy3 整理"
              detail={
                busy === "relay"
                  ? "高推理模式运行中"
                  : mode === "live"
                    ? "真实 TokenHub 调用"
                    : "固定离线结果"
              }
              state={stepState(stage, 3)}
            />
            <TrackStep
              number="04"
              title="校验"
              detail={
                result
                  ? `${result.evidence.verified} 条原文证据通过`
                  : "结构、证据与哈希"
              }
              state={stepState(stage, 4)}
            />
          </ol>

          <div className="privacy-gate">
            <div>
              <span className="gate-label">发送闸门</span>
              <strong>
                {preflight ? "脱敏预览已生成" : "材料尚未离开本机"}
              </strong>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={runPreflight}
              disabled={busy !== null}
            >
              {busy === "preflight" ? "检查中…" : "检查材料"}
            </button>
          </div>

          {preflight ? (
            <div className="sanitized-preview">
              <div className="preview-head">
                <span>实际发送预览</span>
                <code>{preflight.inputHash.slice(0, 12)}…</code>
              </div>
              <pre>{sanitizedActive?.content}</pre>
              <div className="redaction-row">
                {preflight.redactions.length > 0 ? (
                  preflight.redactions.map((finding) => (
                    <span key={finding.type}>
                      {redactionNames[finding.type]} × {finding.count}
                    </span>
                  ))
                ) : (
                  <span className="clear">未发现敏感模式</span>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-preview">
              <RailGlyph />
              <p>先检查材料，确认发送给 Hy3 的最终内容。</p>
            </div>
          )}

          <button
            className="primary-button"
            type="button"
            onClick={runRelay}
            disabled={!preflight || busy !== null}
          >
            <span>{busy === "relay" ? "Hy3 正在整理" : "交给 Hy3 整理"}</span>
            <b aria-hidden="true">→</b>
          </button>

          {error && (
            <div className="error-panel" role="alert">
              <code>{error.code}</code>
              <p>{error.message}</p>
            </div>
          )}
        </section>

        <section className="bay handoff-bay" aria-labelledby="handoff-title">
          <div className="section-heading">
            <span>交接舱 / HANDOFF BAY</span>
            <b id="handoff-title">让下一个工具直接继续</b>
          </div>

          <label className="field-label" htmlFor="target-tool">
            目标工具
          </label>
          <ToolSelect
            id="target-tool"
            value={targetTool}
            onChange={(value) => {
              setTargetTool(value);
              markDirty();
            }}
          />

          {result ? (
            <>
              <div className="result-summary">
                <div>
                  <span>已完成</span>
                  <strong>{result.analysis.completed.length}</strong>
                </div>
                <div>
                  <span>下一步</span>
                  <strong>{result.analysis.nextActions.length}</strong>
                </div>
                <div>
                  <span>风险</span>
                  <strong>{result.analysis.risks.length}</strong>
                </div>
              </div>

              <div className="handoff-sections">
                <ResultSection
                  label="已确认事实"
                  values={result.analysis.facts.map((fact) => fact.statement)}
                  tone="verified"
                />
                <ResultSection
                  label="下一步"
                  values={result.analysis.nextActions.map(
                    (action) => action.action,
                  )}
                  tone="action"
                />
                <ResultSection
                  label="未知与未决"
                  values={[
                    ...result.analysis.openQuestions,
                    ...result.analysis.unknowns,
                  ]}
                  tone="warning"
                />
              </div>

              <label className="handoff-output">
                <span>目标工具提示词</span>
                <textarea
                  readOnly
                  value={result.handoffPrompt}
                  aria-label="目标工具交接提示词"
                />
              </label>

              <div className="export-actions">
                <button type="button" onClick={copyHandoff}>
                  {copied ? "已复制" : "复制提示词"}
                </button>
                <button type="button" onClick={exportMarkdown}>
                  导出 Markdown
                </button>
                <button type="button" onClick={exportJson}>
                  导出 JSON
                </button>
              </div>
            </>
          ) : (
            <div className="empty-handoff">
              <div className="ticket">
                <span>DESTINATION</span>
                <b>{toolName(targetTool)}</b>
                <small>等待接力包</small>
              </div>
              <p>
                交接包会区分事实、决策、风险与未知项，并附带可以直接验证的下一步。
              </p>
            </div>
          )}
        </section>
      </section>

      <footer className="audit-strip">
        <div>
          <span>INPUT SHA-256</span>
          <code>{result?.inputHash ?? preflight?.inputHash ?? "等待检查"}</code>
        </div>
        <div>
          <span>SCHEMA</span>
          <b className={result ? "pass" : ""}>
            {result ? "PASSED" : "NOT RUN"}
          </b>
        </div>
        <div>
          <span>EVIDENCE</span>
          <b className={result?.evidence.unverified === 0 ? "pass" : ""}>
            {result
              ? `${result.evidence.verified} VERIFIED / ${result.evidence.unverified} OPEN`
              : "NOT RUN"}
          </b>
        </div>
        <div>
          <span>PROVIDER REQUEST ID</span>
          <b>
            {result
              ? result.providerRequestIdPresent
                ? "PRESENT"
                : "NOT PROVIDED"
              : "NOT RUN"}
          </b>
        </div>
      </footer>
    </main>
  );
}

function ToolSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: ToolId;
  onChange: (value: ToolId) => void;
}) {
  return (
    <div className="tool-select">
      <span aria-hidden="true">{tools.find((tool) => tool.id === value)?.short}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as ToolId)}
      >
        {tools.map((tool) => (
          <option key={tool.id} value={tool.id}>
            {tool.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function TrackStep({
  number,
  title,
  detail,
  state,
}: {
  number: string;
  title: string;
  detail: string;
  state: "waiting" | "active" | "complete";
}) {
  return (
    <li className={state}>
      <span className="track-node">
        <i />
      </span>
      <div>
        <code>{number}</code>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
    </li>
  );
}

function ResultSection({
  label,
  values,
  tone,
}: {
  label: string;
  values: string[];
  tone: "verified" | "action" | "warning";
}) {
  if (values.length === 0) return null;
  return (
    <section className={`result-section ${tone}`}>
      <h3>{label}</h3>
      <ul>
        {values.slice(0, 4).map((value, index) => (
          <li key={`${value}-${index}`}>{value}</li>
        ))}
      </ul>
    </section>
  );
}

function RailGlyph() {
  return (
    <svg
      width="96"
      height="36"
      viewBox="0 0 96 36"
      aria-hidden="true"
    >
      <path d="M4 18h88" />
      <circle cx="16" cy="18" r="6" />
      <circle cx="48" cy="18" r="6" />
      <circle cx="80" cy="18" r="6" />
    </svg>
  );
}

function stepState(
  stage: number,
  current: number,
): "waiting" | "active" | "complete" {
  if (stage > current) return "complete";
  if (stage === current) return "active";
  return "waiting";
}

function totalSize(materials: RelayRequest["materials"]): number {
  return Math.max(
    1,
    Math.ceil(
      materials.reduce((total, material) => total + material.content.length, 0) /
        1024,
    ),
  );
}

function sumRedactions(preflight: PreflightResponse): number {
  return preflight.redactions.reduce(
    (total, finding) => total + finding.count,
    0,
  );
}

function toolName(id: ToolId): string {
  return tools.find((tool) => tool.id === id)?.name ?? id;
}

function normalizeError(caught: unknown, fallback: string): AppError {
  if (
    caught &&
    typeof caught === "object" &&
    "message" in caught &&
    typeof caught.message === "string"
  ) {
    return {
      code:
        "code" in caught && typeof caught.code === "string"
          ? caught.code
          : "REQUEST_FAILED",
      message: caught.message,
    };
  }
  return { code: "REQUEST_FAILED", message: fallback };
}

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default App;
