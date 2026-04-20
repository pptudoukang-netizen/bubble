param(
    [string]$RepoUrl = "https://github.com/pptudoukang-netizen/test.git",

    [string]$Branch = "main",

    [string]$SourceDir = "build/web-mobile",

    [string]$CloneDir = "temp/github-pages-repo",

    [string]$PagesDir = "docs",

    [string]$CommitMessage = ""
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $env:GCM_INTERACTIVE = "never"
    $env:GIT_TERMINAL_PROMPT = "0"
    $env:GIT_ASKPASS = ""
    $env:SSH_ASKPASS = ""

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

function Get-GitHubPagesUrl {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RemoteUrl
    )

    $normalized = $RemoteUrl.Trim()
    if ($normalized -match '^https://github\.com/([^/]+)/([^/]+?)(\.git)?$') {
        return "https://$($Matches[1]).github.io/$($Matches[2])/"
    }

    if ($normalized -match '^git@github\.com:([^/]+)/([^/]+?)(\.git)?$') {
        return "https://$($Matches[1]).github.io/$($Matches[2])/"
    }

    return ""
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$tempRoot = Resolve-AbsolutePath -PathValue "temp" -BaseDir $projectRoot
$sourcePath = Resolve-AbsolutePath -PathValue $SourceDir -BaseDir $projectRoot
$clonePath = Resolve-AbsolutePath -PathValue $CloneDir -BaseDir $projectRoot

if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Source build directory not found: $sourcePath"
}

if (-not (Test-Path -LiteralPath (Join-Path $sourcePath "index.html"))) {
    throw "index.html was not found in source build directory: $sourcePath"
}

if (-not ($clonePath.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase))) {
    throw "Clone directory must stay inside temp for safety. Current value: $clonePath"
}

if (Test-Path -LiteralPath $clonePath) {
    Remove-Item -Recurse -Force -LiteralPath $clonePath
}

Invoke-Git @("clone", "--branch", $Branch, $RepoUrl, $clonePath)

$pagesPath = Join-Path $clonePath $PagesDir
if (Test-Path -LiteralPath $pagesPath) {
    Remove-Item -Recurse -Force -LiteralPath $pagesPath
}

New-Item -ItemType Directory -Path $pagesPath -Force | Out-Null
Copy-Item -Path (Join-Path $sourcePath "*") -Destination $pagesPath -Recurse -Force
New-Item -ItemType File -Path (Join-Path $pagesPath ".nojekyll") -Force | Out-Null

Invoke-Git @("-C", $clonePath, "add", $PagesDir)

$null = & git -C $clonePath diff --cached --quiet
$hasChanges = $LASTEXITCODE -ne 0

if ($hasChanges) {
    if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
        $CommitMessage = "Deploy web-mobile build to GitHub Pages $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    }

    Invoke-Git @("-C", $clonePath, "commit", "-m", $CommitMessage)
    Invoke-Git @("-C", $clonePath, "push", "origin", $Branch)
}

$pagesUrl = Get-GitHubPagesUrl -RemoteUrl $RepoUrl

Write-Host ""
Write-Host "Prepared and pushed GitHub Pages content."
Write-Host "Repository: $RepoUrl"
Write-Host "Branch: $Branch"
Write-Host "Pages folder: $PagesDir"
if (-not [string]::IsNullOrWhiteSpace($pagesUrl)) {
    Write-Host "Expected Pages URL: $pagesUrl"
}
Write-Host "If the site is not live yet, enable GitHub Pages with branch '$Branch' and folder '/$PagesDir' in repository settings."
