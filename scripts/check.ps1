$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $ProjectRoot "dev-shell.ps1") -Quiet

$files = @(
  "build-profile.js",
  "localization.js",
  "locales\ui.js",
  "locales\gameplay.js",
  "locales\progression.js",
  "game.js",
  "progression.js",
  "hordeheart-model.js",
  "land-eater-model.js",
  "www\build-profile.js",
  "www\localization.js",
  "www\locales\ui.js",
  "www\locales\gameplay.js",
  "www\locales\progression.js",
  "www\game.js",
  "www\progression.js",
  "www\hordeheart-model.js",
  "www\land-eater-model.js",
  "android\app\src\main\assets\public\build-profile.js",
  "android\app\src\main\assets\public\localization.js",
  "android\app\src\main\assets\public\locales\ui.js",
  "android\app\src\main\assets\public\locales\gameplay.js",
  "android\app\src\main\assets\public\locales\progression.js",
  "android\app\src\main\assets\public\game.js",
  "android\app\src\main\assets\public\progression.js",
  "android\app\src\main\assets\public\hordeheart-model.js",
  "android\app\src\main\assets\public\land-eater-model.js",
  "android\app\src\playtest\assets\public\build-profile.js"
)

foreach ($file in $files) {
  $path = Join-Path $ProjectRoot $file
  if (-not (Test-Path $path)) {
    throw "Missing JavaScript file: $file"
  }

  & node --check $path
}

$assetFiles = @(
  "index.html",
  "styles.css",
  "build-profile.js",
  "localization.js",
  "locales\ui.js",
  "locales\gameplay.js",
  "locales\progression.js",
  "game.js",
  "progression.js",
  "hordeheart-model.js",
  "land-eater-model.js",
  "vendor\three.min.js"
)

foreach ($assetFile in $assetFiles) {
  $sourcePath = Join-Path $ProjectRoot $assetFile
  $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourcePath).Hash
  foreach ($targetRoot in @("www", "android\app\src\main\assets\public")) {
    $targetPath = Join-Path (Join-Path $ProjectRoot $targetRoot) $assetFile
    if (-not (Test-Path -LiteralPath $targetPath)) {
      throw "Missing synchronized web asset: $targetRoot\$assetFile"
    }
    $targetHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $targetPath).Hash
    if ($targetHash -ne $sourceHash) {
      throw "Web asset is out of sync: $targetRoot\$assetFile"
    }
  }
}

$standardProfile = Get-Content -LiteralPath (Join-Path $ProjectRoot "build-profile.js") -Raw
if (
  $standardProfile -notmatch '\bchannel\s*:\s*"standard"' -or
  $standardProfile -notmatch '\btestAllAccess\s*:\s*false\b'
) {
  throw "The standard build profile must disable temporary all-content access."
}

$playtestProfilePath = Join-Path $ProjectRoot "android\app\src\playtest\assets\public\build-profile.js"
$playtestProfile = Get-Content -LiteralPath $playtestProfilePath -Raw
if (
  $playtestProfile -notmatch '\bchannel\s*:\s*"test-all"' -or
  $playtestProfile -notmatch '\btestAllAccess\s*:\s*true\b'
) {
  throw "The playtest build profile must enable temporary all-content access."
}

Write-Host "JavaScript syntax and synchronized web asset checks passed."
