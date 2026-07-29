param(
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$healthUrl = "http://127.0.0.1:4317/api/health"
$appUrl = "http://127.0.0.1:4317/"
$stateDirectory = Join-Path $repoRoot ".local-state"
$logDirectory = Join-Path $repoRoot "logs"
$pidPath = Join-Path $stateDirectory "hy3-relay.pid"

try {
    $existing = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    if ($existing.ok) {
        if (-not $NoBrowser) {
            Start-Process $appUrl
        }
        Write-Host "Hy3 Relay 已在本机运行：$appUrl"
        exit 0
    }
}
catch {
    # No healthy local instance is running; continue with a clean start.
}

$occupied = Get-NetTCPConnection -LocalPort 4317 -State Listen -ErrorAction SilentlyContinue
if ($occupied) {
    throw "本机端口 4317 已被其他程序占用。请先关闭占用程序，再重试。"
}

if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot "dist\index.html"))) {
    Push-Location $PSScriptRoot
    try {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) {
            throw "应用构建失败。"
        }
    }
    finally {
        Pop-Location
    }
}

New-Item -ItemType Directory -Force -Path $stateDirectory, $logDirectory | Out-Null
. (Join-Path $repoRoot "scripts\load-hy3-key.ps1")
$env:NODE_ENV = "production"
$env:RELAY_PORT = "4317"

$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$tsxCli = Join-Path $PSScriptRoot "node_modules\tsx\dist\cli.mjs"
$serverEntry = Join-Path $PSScriptRoot "server\index.ts"
$stdoutPath = Join-Path $logDirectory "hy3-relay.stdout.log"
$stderrPath = Join-Path $logDirectory "hy3-relay.stderr.log"

try {
    $server = Start-Process `
        -FilePath $nodePath `
        -ArgumentList @($tsxCli, $serverEntry) `
        -WorkingDirectory $PSScriptRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -PassThru
    Set-Content -LiteralPath $pidPath -Value $server.Id
}
finally {
    Remove-Item Env:HY3_API_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
    Remove-Item Env:RELAY_PORT -ErrorAction SilentlyContinue
}

$deadline = (Get-Date).AddSeconds(30)
do {
    Start-Sleep -Milliseconds 300
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
        if ($health.ok) {
            if (-not $health.liveConfigured) {
                throw "服务已启动，但没有读到 Hy3 密钥。"
            }
            if (-not $NoBrowser) {
                Start-Process $appUrl
            }
            Write-Host "Hy3 Relay 已启动：$appUrl"
            exit 0
        }
    }
    catch {
        if ($server.HasExited) {
            throw "本地服务启动失败，请查看 $stderrPath"
        }
    }
} while ((Get-Date) -lt $deadline)

throw "本地服务启动超时，请查看 $stderrPath"
