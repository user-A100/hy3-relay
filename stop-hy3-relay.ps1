$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$pidPath = Join-Path $repoRoot ".local-state\hy3-relay.pid"

if (-not (Test-Path -LiteralPath $pidPath)) {
    Write-Host "没有找到 Hy3 Relay 的本地运行记录。"
    exit 0
}

$serverPid = [int](Get-Content -LiteralPath $pidPath -Raw)
$server = Get-CimInstance Win32_Process -Filter "ProcessId = $serverPid" -ErrorAction SilentlyContinue

if (-not $server) {
    Remove-Item -LiteralPath $pidPath
    Write-Host "Hy3 Relay 已经停止。"
    exit 0
}

$expectedEntry = (Join-Path $PSScriptRoot "server\index.ts").ToLowerInvariant()
$actualCommand = if ($null -eq $server.CommandLine) {
    ""
} else {
    [string]$server.CommandLine
}
$actualCommand = $actualCommand.ToLowerInvariant()
if (-not $actualCommand.Contains($expectedEntry)) {
    throw "运行记录与当前 Hy3 Relay 不匹配，为避免误关其他程序，已取消操作。"
}

Stop-Process -Id $serverPid
Remove-Item -LiteralPath $pidPath
Write-Host "Hy3 Relay 已停止。"
