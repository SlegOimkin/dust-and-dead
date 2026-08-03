param(
  [string]$StandardApkPath,
  [string]$PlaytestApkPath
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($StandardApkPath)) {
  $StandardApkPath = Join-Path $ProjectRoot "DustAndDead-debug.apk"
}
if ([string]::IsNullOrWhiteSpace($PlaytestApkPath)) {
  $PlaytestApkPath = Join-Path $ProjectRoot "DustAndDead-playtest.apk"
}

& (Join-Path $PSScriptRoot "verify-apk.ps1") `
  -ApkPath $StandardApkPath `
  -ExpectedBuildChannel "standard" `
  -ExpectedAppLabel "Dust and Dead" `
  -ExpectedVersionCode "44" `
  -ExpectedVersionName "1.43"

& (Join-Path $PSScriptRoot "verify-apk.ps1") `
  -ApkPath $PlaytestApkPath `
  -ExpectedBuildChannel "test-all" `
  -ExpectedAppLabel "Dust and Dead Test" `
  -ExpectedVersionCode "44" `
  -ExpectedVersionName "1.43-test" `
  -CompatibleWithApkPath $StandardApkPath
