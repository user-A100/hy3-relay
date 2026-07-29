import type { RelayAnalysis } from "../shared/contracts.js";

export const offlineAnalysis: RelayAnalysis = {
  goal:
    "让 Duration CLI 支持按 h、m、s 顺序组合的时长，同时保留既有行为并通过全部测试。",
  completed: [
    "已经建立 Node.js 内置测试套件。",
    "单段时长 45s、15m、2h 已能正确解析。",
  ],
  facts: [
    {
      statement: "当前正则只接受一个数字和一个单位。",
      source: "duration.js",
      evidence: "const match = /^(\\d+)([hms])$/.exec(input);",
    },
    {
      statement: "复合时长 1h30m 的期望值是 5400 秒。",
      source: "duration.test.js",
      evidence: 'assert.equal(parseDuration("1h30m"), 5400);',
    },
  ],
  decisions: [
    {
      decision: "不增加运行时依赖。",
      reason: "任务说明明确要求只使用现有 Node.js 能力。",
    },
  ],
  files: ["src/duration.js", "test/duration.test.js", "README.md"],
  failedAttempts: [
    "现有单段正则无法匹配 1h30m，因此测试在解析阶段失败。",
  ],
  openQuestions: [],
  risks: [
    "仅重复匹配数字和单位会误接收 30m1h 或 1h20h，需要校验单位顺序与重复。",
  ],
  nextActions: [
    {
      action: "使用连续分词方式解析 h、m、s，并确保完整消费输入。",
      verify: "运行 npm test，确认复合值和非法值测试全部通过。",
    },
    {
      action: "运行 CLI 检查 1h30m 的输出。",
      verify: "node src/cli.js 1h30m 应输出 5400。",
    },
  ],
  unknowns: [
    "材料中没有规定是否允许 0h；实现前应保持与现有整数规则一致。",
  ],
};
