param(
  [string]$ApkPath,
  [ValidateSet("standard", "test-all")]
  [string]$ExpectedBuildChannel = "standard",
  [string]$ExpectedAppLabel,
  [string]$ExpectedVersionCode,
  [string]$ExpectedVersionName,
  [string]$CompatibleWithApkPath
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $ProjectRoot "dev-shell.ps1") -Quiet

if ([string]::IsNullOrWhiteSpace($ApkPath)) {
  $ApkPath = Join-Path $ProjectRoot "DustAndDead-debug.apk"
}
$ApkPath = (Resolve-Path $ApkPath).Path

$apksigner = Join-Path $env:ANDROID_HOME "build-tools\36.0.0\apksigner.bat"
$aapt = Join-Path $env:ANDROID_HOME "build-tools\36.0.0\aapt.exe"
$jar = Join-Path $env:JAVA_HOME "bin\jar.exe"
$expectedPackageName = "com.testproject.dustanddead"

function Get-ApkBadging {
  param([string]$Path)

  $output = @(& $aapt dump badging $Path)
  if ($LASTEXITCODE -ne 0) {
    throw "aapt badging inspection failed for '$Path' with exit code $LASTEXITCODE."
  }
  return $output
}

function Get-ApkMetadata {
  param([string]$Path)

  $badging = @(Get-ApkBadging -Path $Path)
  $packageLine = $badging | Where-Object { $_ -like "package:*" } | Select-Object -First 1
  if (
    [string]::IsNullOrWhiteSpace($packageLine) -or
    $packageLine -notmatch "^package: name='(?<name>[^']+)' versionCode='(?<code>[^']+)' versionName='(?<version>[^']*)'"
  ) {
    throw "Could not parse package metadata from '$Path'."
  }
  $packageName = $Matches.name
  $versionCode = $Matches.code
  $versionName = $Matches.version

  $label = ""
  $labelLine = $badging | Where-Object { $_ -like "application-label:*" } | Select-Object -First 1
  if ($labelLine -and $labelLine -match "^application-label:'(?<label>.*)'$") {
    $label = $Matches.label
  }

  return [pscustomobject]@{
    PackageName = $packageName
    VersionCode = $versionCode
    VersionName = $versionName
    AppLabel = $label
    Badging = $badging
  }
}

function Assert-ApkSignature {
  param([string]$Path)

  & $apksigner verify --verbose $Path
  if ($LASTEXITCODE -ne 0) {
    throw "APK signature verification failed for '$Path' with exit code $LASTEXITCODE."
  }
}

function Get-ApkSignerSha256 {
  param([string]$Path)

  $certificateOutput = @(& $apksigner verify --print-certs $Path)
  if ($LASTEXITCODE -ne 0) {
    throw "APK certificate inspection failed for '$Path' with exit code $LASTEXITCODE."
  }
  $digestLine = $certificateOutput |
    Where-Object { $_ -like "Signer #1 certificate SHA-256 digest:*" } |
    Select-Object -First 1
  if (
    [string]::IsNullOrWhiteSpace($digestLine) -or
    $digestLine -notmatch "SHA-256 digest:\s*(?<digest>[0-9a-fA-F]+)$"
  ) {
    throw "Could not parse the signer SHA-256 digest from '$Path'."
  }
  return $Matches.digest.ToLowerInvariant()
}

function Read-ApkTextEntry {
  param(
    [string]$Path,
    [string]$EntryName
  )

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($Path)
  try {
    $entry = $archive.GetEntry($EntryName)
    if (-not $entry) {
      throw "APK is missing required asset: $EntryName"
    }
    $stream = $entry.Open()
    try {
      $reader = [System.IO.StreamReader]::new(
        $stream,
        [System.Text.Encoding]::UTF8,
        $true
      )
      try {
        return $reader.ReadToEnd()
      }
      finally {
        $reader.Dispose()
      }
    }
    finally {
      $stream.Dispose()
    }
  }
  finally {
    $archive.Dispose()
  }
}

Assert-ApkSignature -Path $ApkPath
$metadata = Get-ApkMetadata -Path $ApkPath
if ($metadata.PackageName -ne $expectedPackageName) {
  throw "Unexpected applicationId '$($metadata.PackageName)' in '$ApkPath'; expected '$expectedPackageName'."
}
if (
  -not [string]::IsNullOrWhiteSpace($ExpectedVersionCode) -and
  $metadata.VersionCode -ne $ExpectedVersionCode
) {
  throw "Unexpected versionCode '$($metadata.VersionCode)' in '$ApkPath'; expected '$ExpectedVersionCode'."
}
if (
  -not [string]::IsNullOrWhiteSpace($ExpectedVersionName) -and
  $metadata.VersionName -ne $ExpectedVersionName
) {
  throw "Unexpected versionName '$($metadata.VersionName)' in '$ApkPath'; expected '$ExpectedVersionName'."
}
if (
  -not [string]::IsNullOrWhiteSpace($ExpectedAppLabel) -and
  $metadata.AppLabel -ne $ExpectedAppLabel
) {
  throw "Unexpected app label '$($metadata.AppLabel)' in '$ApkPath'; expected '$ExpectedAppLabel'."
}
$metadata.Badging | Select-Object -First 6

$requiredAssets = @(
  "assets/public/index.html",
  "assets/public/build-profile.js",
  "assets/public/game.js",
  "assets/public/progression.js",
  "assets/public/hordeheart-model.js",
  "assets/public/land-eater-model.js",
  "assets/public/styles.css",
  "assets/public/vendor/three.min.js"
)

$entries = @(& $jar tf $ApkPath)
if ($LASTEXITCODE -ne 0) {
  throw "APK archive inspection failed with exit code $LASTEXITCODE."
}
foreach ($asset in $requiredAssets) {
  if ($entries -notcontains $asset) {
    throw "APK is missing required asset: $asset"
  }
}

$profileSource = Read-ApkTextEntry -Path $ApkPath -EntryName "assets/public/build-profile.js"
if ($profileSource -notmatch '\bchannel\s*:\s*"(?<channel>[^"]+)"') {
  throw "Could not parse build channel from assets/public/build-profile.js in '$ApkPath'."
}
$actualBuildChannel = $Matches.channel
if ($profileSource -notmatch '\btestAllAccess\s*:\s*(?<access>true|false)\b') {
  throw "Could not parse testAllAccess from assets/public/build-profile.js in '$ApkPath'."
}
$actualTestAllAccess = $Matches.access -eq "true"
$expectedTestAllAccess = $ExpectedBuildChannel -eq "test-all"
if (
  $actualBuildChannel -ne $ExpectedBuildChannel -or
  $actualTestAllAccess -ne $expectedTestAllAccess
) {
  throw (
    "Unexpected build profile in '$ApkPath': channel='$actualBuildChannel', " +
    "testAllAccess=$actualTestAllAccess; expected channel='$ExpectedBuildChannel', " +
    "testAllAccess=$expectedTestAllAccess."
  )
}

$signerSha256 = Get-ApkSignerSha256 -Path $ApkPath
Write-Host "Build profile: $actualBuildChannel (testAllAccess=$actualTestAllAccess)"
Write-Host "Signer SHA256: $signerSha256"

if (-not [string]::IsNullOrWhiteSpace($CompatibleWithApkPath)) {
  $compatiblePath = (Resolve-Path $CompatibleWithApkPath).Path
  Assert-ApkSignature -Path $compatiblePath
  $compatibleMetadata = Get-ApkMetadata -Path $compatiblePath
  $compatibleSignerSha256 = Get-ApkSignerSha256 -Path $compatiblePath

  if ($metadata.PackageName -ne $compatibleMetadata.PackageName) {
    throw "APK applicationIds are incompatible: '$($metadata.PackageName)' and '$($compatibleMetadata.PackageName)'."
  }
  if ($metadata.VersionCode -ne $compatibleMetadata.VersionCode) {
    throw "APK versionCodes are incompatible: '$($metadata.VersionCode)' and '$($compatibleMetadata.VersionCode)'."
  }
  if ($signerSha256 -ne $compatibleSignerSha256) {
    throw "APK signer certificates are incompatible: '$signerSha256' and '$compatibleSignerSha256'."
  }

  Write-Host "Compatibility: same applicationId, versionCode and signer as $compatiblePath"
}

$apk = Get-Item $ApkPath
$hash = Get-FileHash $ApkPath -Algorithm SHA256
Write-Host "APK: $($apk.FullName)"
Write-Host "Size: $($apk.Length) bytes"
Write-Host "SHA256: $($hash.Hash)"
