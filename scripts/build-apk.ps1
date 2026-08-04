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
  # ZipFlinger can preserve large zero-filled holes when sizeable web assets
  # are replaced by an incremental packageDebug build. A clean package keeps
  # the distributable APK compact and deterministic.
  & .\gradlew.bat clean assembleDebug --no-daemon --console=plain
  if ($LASTEXITCODE -ne 0) {
    throw "Gradle clean assembleDebug failed with exit code $LASTEXITCODE."
  }
}
finally {
  Pop-Location
}

$sourceApk = Join-Path $ProjectRoot "android\app\build\outputs\apk\debug\app-debug.apk"
$targetApk = Join-Path $ProjectRoot "DustAndDead-debug.apk"
if (-not (Test-Path $sourceApk)) {
  throw "Gradle completed but APK was not found: $sourceApk"
}

Copy-Item $sourceApk $targetApk -Force
& (Join-Path $PSScriptRoot "verify-apk.ps1") `
  -ApkPath $targetApk `
  -ExpectedBuildChannel "standard" `
  -ExpectedAppLabel "Dust and Dead" `
  -ExpectedVersionCode "55" `
  -ExpectedVersionName "1.54"
