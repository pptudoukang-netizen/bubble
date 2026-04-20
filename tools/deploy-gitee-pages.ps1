param(
    [Parameter(Mandatory = $true)]
    [string]$RepoUrl,

    [string]$Branch = "master",

    [string]$SourceDir = "build/web-mobile",

    [string]$PublishDir = "temp/gitee-pages-publish",

    [string]$CommitMessage = ""
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & git @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Git command failed: git $($Arguments -join ' ')"
    }
}

function Resolve-AbsolutePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PathValue,

        [Parameter(Mandatory = $true)]
        [string]$BaseDir
    )

    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return [System.IO.Path]::GetFullPath($PathValue)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $BaseDir $PathValue))
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Resolve-AbsolutePath -PathValue $SourceDir -BaseDir $projectRoot
$publishPath = Resolve-AbsolutePath -PathValue $PublishDir -BaseDir $projectRoot
$tempRoot = Resolve-AbsolutePath -PathValue "temp" -BaseDir $projectRoot

if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Source build directory not found: $sourcePath"
}

if (-not (Test-Path -LiteralPath (Join-Path $sourcePath "index.html"))) {
    throw "index.html was not found in source build directory: $sourcePath"
}

if (-not ($publishPath.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase))) {
    throw "Publish directory must stay inside temp for safety. Current value: $publishPath"
}

New-Item -ItemType Directory -Path $publishPath -Force | Out-Null

Get-ChildItem -LiteralPath $publishPath -Force | Remove-Item -Recurse -Force
Copy-Item -Path (Join-Path $sourcePath "*") -Destination $publishPath -Recurse -Force

New-Item -ItemType File -Path (Join-Path $publishPath ".nojekyll") -Force | Out-Null

$readmePath = Join-Path $publishPath "README.md"
$readmeContent = @"
# bubble web-mobile build

This directory is generated from the Cocos Creator `build/web-mobile` export and is intended for static hosting on Gitee Pages.
"@
Set-Content -LiteralPath $readmePath -Value $readmeContent -Encoding UTF8

if (-not (Test-Path -LiteralPath (Join-Path $publishPath ".git"))) {
    Invoke-Git @("-C", $publishPath, "init", "-b", $Branch)
}

$existingRemoteUrl = ""
$remoteNames = & git -C $publishPath remote
if ($LASTEXITCODE -ne 0) {
    throw "Failed to list git remotes in $publishPath"
}

if ($remoteNames -contains "origin") {
    $existingRemoteUrlOutput = & git -C $publishPath remote get-url origin
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to get origin remote URL in $publishPath"
    }
    $existingRemoteUrl = $existingRemoteUrlOutput.Trim()
}

if ([string]::IsNullOrWhiteSpace($existingRemoteUrl)) {
    Invoke-Git @("-C", $publishPath, "remote", "add", "origin", $RepoUrl)
} elseif ($existingRemoteUrl -ne $RepoUrl) {
    Invoke-Git @("-C", $publishPath, "remote", "set-url", "origin", $RepoUrl)
}

Invoke-Git @("-C", $publishPath, "checkout", "-B", $Branch)
Invoke-Git @("-C", $publishPath, "add", "--all")

$hasChanges = $true
$null = & git -C $publishPath diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    $hasChanges = $false
} else {
    $hasChanges = $true
}

if ($hasChanges) {
    if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
        $CommitMessage = "Deploy web-mobile build $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    }

    Invoke-Git @("-C", $publishPath, "commit", "-m", $CommitMessage)
}

Invoke-Git @("-C", $publishPath, "push", "-u", "origin", $Branch, "--force")

Write-Host ""
Write-Host "Published successfully."
Write-Host "Publish directory: $publishPath"
Write-Host "Remote: $RepoUrl"
Write-Host "Branch: $Branch"
