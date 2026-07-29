<#
.SYNOPSIS
Loads the locally encrypted Hy3 API Key into the current PowerShell process.

.NOTES
Dot-source this script. It never prints the key.
#>

$secretPath = Join-Path $PSScriptRoot "..\.local-secrets\hy3-key.clixml"
if (-not (Test-Path -LiteralPath $secretPath)) {
    throw "未找到本地加密密钥。请先运行 scripts\save-hy3-key.ps1。"
}

$secureKey = Import-Clixml -LiteralPath $secretPath
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
    $env:HY3_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    $env:OPENAI_API_KEY = $env:HY3_API_KEY
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
}
