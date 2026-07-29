<#
.SYNOPSIS
Stores the Hy3 API Key locally using Windows DPAPI.

.DESCRIPTION
The key is entered in a visible local PowerShell window with hidden input.
It is encrypted for the current Windows user and is never printed.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$secretDirectory = Join-Path $PSScriptRoot "..\.local-secrets"
$secretPath = Join-Path $secretDirectory "hy3-key.clixml"

try {
    Write-Host ""
    Write-Host "Hy3 本地密钥设置" -ForegroundColor Cyan
    Write-Host "密钥内容不会显示，也不会发送到对话或写入源码。"
    Write-Host "加密文件只能由当前 Windows 用户在本机解密。"
    Write-Host ""

    $secureKey = Read-Host "请粘贴完整的 Hy3 API Key，然后按回车" -AsSecureString
    if ($secureKey.Length -lt 20) {
        throw "输入过短，未保存。"
    }

    New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null
    $secureKey | Export-Clixml -LiteralPath $secretPath

    Write-Host ""
    Write-Host "已加密保存到 D 盘本地密钥目录。" -ForegroundColor Green
    Write-Host "该目录已被 .gitignore 排除。"
}
catch {
    Write-Host ""
    Write-Host "保存失败：$($_.Exception.Message)" -ForegroundColor Red
}
finally {
    Write-Host ""
    Read-Host "按回车关闭窗口"
}
