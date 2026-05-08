param(
  [string]$OutputDir = ""
)

$scriptPath = Join-Path $PSScriptRoot "fix-wechat-project-config.js"
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $OutputDir = Join-Path $projectRoot "build\wechatgame"
}
$nodeCommand = Get-Command node -ErrorAction Stop

if (!(Test-Path -LiteralPath $scriptPath)) {
  throw "Fix script not found: $scriptPath"
}

& $nodeCommand.Source $scriptPath $OutputDir
if ($LASTEXITCODE -ne 0) {
  throw "Fix script failed with exit code: $LASTEXITCODE"
}

Write-Host "[DONE] WeChat project config fixed for $OutputDir"
