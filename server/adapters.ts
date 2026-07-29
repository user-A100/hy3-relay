import type { RelayAnalysis, ToolId } from "../shared/contracts.js";

const toolInstructions: Record<ToolId, string> = {
  codebuddy:
    "先复核交接包中的文件与验证命令，再按顺序继续；任何写文件或执行命令前说明预期影响。",
  cursor:
    "先在 Ask 模式核对上下文，再在 Agent 模式处理已确认的下一步；不要把未知项当成事实。",
  aider:
    "先用 /add 加入交接包列出的相关文件，再讨论方案；获得确认后编辑并运行验证命令。",
  cline:
    "先在 Plan 模式核对目标、风险和未决问题；进入 Act 模式后逐项请求必要权限。",
  continue:
    "先在 Chat 中确认交接事实，再使用 Edit/Agent 完成下一步；保留原有约束和测试要求。",
  opencode:
    "先在 Plan 模式检查交接内容，再切换 Build；文件修改和命令执行保持逐项可审查。",
};

const toolNames: Record<ToolId, string> = {
  codebuddy: "CodeBuddy",
  cursor: "Cursor",
  aider: "Aider",
  cline: "Cline",
  continue: "Continue",
  opencode: "OpenCode",
};

function bullets(values: string[], empty = "无已确认内容"): string {
  return values.length > 0
    ? values.map((value) => `- ${value}`).join("\n")
    : `- ${empty}`;
}

export function buildHandoffPrompt(
  analysis: RelayAnalysis,
  targetTool: ToolId,
): string {
  const actions = analysis.nextActions
    .map(
      (item, index) =>
        `${index + 1}. ${item.action}\n   验证：${item.verify}`,
    )
    .join("\n");

  return `# ${toolNames[targetTool]} 继续任务

你正在接手一个已经开始的开发任务。只依据下面的已确认事实继续工作；未知项需要先核对。

## 交接目标

${analysis.goal}

## 已完成

${bullets(analysis.completed)}

## 已确认事实

${bullets(analysis.facts.map((fact) => fact.statement))}

## 关键决策

${bullets(
  analysis.decisions.map(
    (decision) => `${decision.decision}（原因：${decision.reason}）`,
  ),
)}

## 相关文件

${bullets(analysis.files)}

## 失败尝试

${bullets(analysis.failedAttempts)}

## 风险

${bullets(analysis.risks)}

## 未决问题与未知项

${bullets([...analysis.openQuestions, ...analysis.unknowns])}

## 下一步

${actions}

## ${toolNames[targetTool]} 执行约束

${toolInstructions[targetTool]}
`;
}

export function toMarkdownExport(
  analysis: RelayAnalysis,
  targetTool: ToolId,
  inputHash: string,
): string {
  return `---
generator: Hy3 Relay
model: hy3
target: ${targetTool}
input_sha256: ${inputHash}
---

${buildHandoffPrompt(analysis, targetTool)}
`;
}
