param(
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path $ProjectRoot).Path

function Get-LatestNodeHome {
  $nodeExtractRoot = Join-Path $ProjectRoot ".tools\node\extracted"
  if (-not (Test-Path $nodeExtractRoot)) {
    return $null
  }

  $nodeHome = Get-ChildItem $nodeExtractRoot -Directory -Filter "node-v*-win-x64" |
    ForEach-Object {
      if ($_.Name -match "node-v(?<version>\d+\.\d+\.\d+)-win-x64") {
        [pscustomobject]@{
          Path = $_.FullName
          Version = [version]$Matches.version
        }
      }
    } |
    Sort-Object Version -Descending |
    Select-Object -First 1

  if (-not $nodeHome) {
    return $null
  }

  return $nodeHome.Path
}

function Get-FirstExistingDirectory {
  param([string[]]$Candidates)

  foreach ($candidate in $Candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
    if (Test-Path -LiteralPath $candidate -PathType Container) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  return $null
}

function Get-SystemJavaHome {
  if ($env:JAVA_HOME -and (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
    return (Resolve-Path -LiteralPath $env:JAVA_HOME).Path
  }

  $javaCommand = Get-Command java -ErrorAction SilentlyContinue
  if (-not $javaCommand) { return $null }

  $javaBin = Split-Path -Parent $javaCommand.Source
  return (Split-Path -Parent $javaBin)
}

function Add-PathEntries {
  param([string[]]$Entries)

  $existing = @()
  if ($env:Path) {
    $existing = $env:Path -split ";" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  }

  $final = @()
  foreach ($entry in ($Entries + $existing)) {
    if ([string]::IsNullOrWhiteSpace($entry)) { continue }
    $candidate = $entry.Trim()
    if (-not ($final | Where-Object { $_ -ieq $candidate })) {
      $final += $candidate
    }
  }

  $env:Path = ($final -join ";")
}

$pathEntries = @()

$localNodeHome = Get-LatestNodeHome
if ($localNodeHome) {
  $env:NODE_HOME = $localNodeHome
  $pathEntries += $localNodeHome
}

$localJdkRoot = Join-Path $ProjectRoot ".tools\jdk\extracted"
$localJavaHome = Get-FirstExistingDirectory @(
  (Join-Path $localJdkRoot "jdk-21.0.11+10")
)
if (-not $localJavaHome -and (Test-Path -LiteralPath $localJdkRoot -PathType Container)) {
  $localJavaHome = Get-ChildItem -LiteralPath $localJdkRoot -Directory |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "bin\java.exe") } |
    Sort-Object Name -Descending |
    Select-Object -ExpandProperty FullName -First 1
}

$javaHome = $localJavaHome
if (-not $javaHome) {
  $javaHome = Get-SystemJavaHome
}
if ($javaHome) {
  $env:JAVA_HOME = $javaHome
  $pathEntries += (Join-Path $javaHome "bin")
}

$androidCandidates = @(
  (Join-Path $ProjectRoot ".tools\android-sdk"),
  $env:ANDROID_HOME,
  $env:ANDROID_SDK_ROOT
)
if ($env:LOCALAPPDATA) {
  $androidCandidates += (Join-Path $env:LOCALAPPDATA "Android\Sdk")
}
$androidHome = Get-FirstExistingDirectory $androidCandidates
if ($androidHome) {
  $env:ANDROID_HOME = $androidHome
  $env:ANDROID_SDK_ROOT = $androidHome
  $pathEntries += (Join-Path $androidHome "platform-tools")
  $pathEntries += (Join-Path $androidHome "cmdline-tools\latest\bin")
  $pathEntries += (Join-Path $androidHome "build-tools\36.0.0")
}

$pathEntries += (Join-Path $ProjectRoot "node_modules\.bin")
Add-PathEntries $pathEntries

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js was not found. Install Node.js 22 or place it under .tools\node\extracted."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm was not found. Install Node.js 22 or place it under .tools\node\extracted."
}

if (-not $Quiet) {
  Write-Host "Dust & Dead dev shell loaded."
  Write-Host "Project: $ProjectRoot"
  Write-Host "Node: $(& node --version)"
  Write-Host "npm: $(& npm --version)"
  if ($javaHome) {
    Write-Host "Java: $(& java -version 2>&1 | Select-Object -First 1)"
  } else {
    Write-Host "Java: not configured (required only for Android builds)"
  }
  if ($androidHome) {
    Write-Host "ANDROID_HOME: $env:ANDROID_HOME"
  } else {
    Write-Host "Android SDK: not configured (required only for Android builds)"
  }
  Write-Host ""
  Write-Host "For an interactive shell, run: . .\dev-shell.ps1"
}
