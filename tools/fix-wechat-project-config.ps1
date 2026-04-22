param(
  [string]$OutputDir = "F:\game\bubble\build\wechatgame"
)

$scriptPath = "F:\game\bubble\tools\fix-wechat-project-config.js"
$nodePath = "C:\nvm4w\nodejs\node.exe"

if (!(Test-Path -LiteralPath $scriptPath)) {
  throw "Fix script not found: $scriptPath"
}

if (!(Test-Path -LiteralPath $nodePath)) {
  throw "Node not found: $nodePath"
}

& $nodePath $scriptPath $OutputDir
if ($LASTEXITCODE -ne 0) {
  throw "Fix script failed with exit code: $LASTEXITCODE"
}

Write-Host "[DONE] WeChat project config fixed for $OutputDir"
