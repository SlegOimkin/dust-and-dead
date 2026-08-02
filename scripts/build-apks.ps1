param(
  [switch]$SkipSync
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $ProjectRoot "dev-shell.ps1") -Quiet

if (-not $SkipSync) {
  & (Join-Path $PSScriptRoot "sync-android.ps1") -Quiet
}

Push-Location (Join-Path $ProjectRoot "android")
try {
  # Build both channels from the same clean tree so their package metadata,
  # signing identity and synchronized web payload cannot drift apart.
  & .\gradlew.bat clean assembleDebug assemblePlaytest --no-daemon --console=plain
  if ($LASTEXITCODE -ne 0) {
    throw "Gradle clean assembleDebug assemblePlaytest failed with exit code $LASTEXITCODE."
  }
}
finally {
  Pop-Location
}

$standardSourceApk = Join-Path $ProjectRoot "android\app\build\outputs\apk\debug\app-debug.apk"
$playtestSourceApk = Join-Path $ProjectRoot "android\app\build\outputs\apk\playtest\app-playtest.apk"
$standardTargetApk = Join-Path $ProjectRoot "DustAndDead-debug.apk"
$playtestTargetApk = Join-Path $ProjectRoot "DustAndDead-playtest.apk"

foreach ($sourceApk in @($standardSourceApk, $playtestSourceApk)) {
  if (-not (Test-Path -LiteralPath $sourceApk)) {
    throw "Gradle completed but APK was not found: $sourceApk"
  }
}

Copy-Item -LiteralPath $standardSourceApk -Destination $standardTargetApk -Force
Copy-Item -LiteralPath $playtestSourceApk -Destination $playtestTargetApk -Force

& (Join-Path $PSScriptRoot "verify-apks.ps1") `
  -StandardApkPath $standardTargetApk `
  -PlaytestApkPath $playtestTargetApk
