# Hy3 Relay｜上下文接力站

Hy3 Relay 是一个仅在本机运行的 AI 编程上下文交接应用。它把来自 CodeBuddy、Cursor、
Aider、Cline、Continue 或 OpenCode 的代码片段、日志和任务记录，整理为带证据的结构化
接力包，再生成适配目标工具的继续执行提示词。

项目对应 [Tencent-Hunyuan/Hy3 Issue #2](https://github.com/Tencent-Hunyuan/Hy3/issues/2)，
核心能力由 `hy3` 的推理与结构化生成驱动。

演示视频：[`demo.mp4`](demo.mp4)（57.7 秒，本地完整流程）。

## 工作流程

1. 接收代码、日志、对话或 diff；
2. 在本地确定性遮盖密钥、令牌、邮箱和私人路径；
3. 由 Hy3 生成事实、决策、风险、未知项和下一步；
4. 本地校验结构与证据引用；
5. 导出适配目标工具的提示词、Markdown 或 JSON。

## 本地使用

要求 Node.js 20 或更高版本。首次下载后运行：

```powershell
npm ci
```

然后：

1. 运行仓库根目录的 `scripts\save-hy3-key.ps1`，在独立窗口中输入 Hy3 API Key。
   密钥会使用当前 Windows 账户加密，不会写进源码或普通配置文件。
2. 双击 `start-hy3-relay.cmd`。
3. 浏览器打开 `http://127.0.0.1:4317/` 后，先选择来源和目标工具，再检查脱敏预览。
4. 确认实际发送内容后，使用“交给 Hy3 整理”生成接力包。
5. 不使用时可双击 `stop-hy3-relay.cmd`。

## 安全边界

- 服务只监听 `127.0.0.1`，不会公开部署。
- 输入只在当前进程内存中处理，不落盘保存。
- API Key 只在本地服务进程中临时解密。
- 发送前先做确定性脱敏，并展示最终发送预览与 SHA-256。
- 离线样例是显式模式，不会伪装成真实 Hy3 返回。

完整设计见 [`docs/hy3-relay-architecture.md`](docs/hy3-relay-architecture.md)。

## 开发验证

```powershell
npm run typecheck
npm test
npm run build
```

当前自动测试共 25 项，覆盖脱敏、结构验证、目标工具导出、超时、鉴权失败、限流、
无效 JSON 和离线端到端流程。

## 开源许可

[MIT](LICENSE)
