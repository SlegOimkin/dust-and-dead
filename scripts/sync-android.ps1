param(
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$SyncQuiet = $Quiet
. (Join-Path $ProjectRoot "dev-shell.ps1") -Quiet

New-Item -ItemType Directory -Path (Join-Path $ProjectRoot "www\vendor") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $ProjectRoot "www\locales") -Force | Out-Null

Copy-Item (Join-Path $ProjectRoot "index.html") (Join-Path $ProjectRoot "www\index.html") -Force
Copy-Item (Join-Path $ProjectRoot "styles.css") (Join-Path $ProjectRoot "www\styles.css") -Force
Copy-Item (Join-Path $ProjectRoot "build-profile.js") (Join-Path $ProjectRoot "www\build-profile.js") -Force
Copy-Item (Join-Path $ProjectRoot "localization.js") (Join-Path $ProjectRoot "www\localization.js") -Force
Copy-Item (Join-Path $ProjectRoot "locales\ui.js") (Join-Path $ProjectRoot "www\locales\ui.js") -Force
Copy-Item (Join-Path $ProjectRoot "locales\gameplay.js") (Join-Path $ProjectRoot "www\locales\gameplay.js") -Force
Copy-Item (Join-Path $ProjectRoot "locales\progression.js") (Join-Path $ProjectRoot "www\locales\progression.js") -Force
Copy-Item (Join-Path $ProjectRoot "game.js") (Join-Path $ProjectRoot "www\game.js") -Force
Copy-Item (Join-Path $ProjectRoot "progression.js") (Join-Path $ProjectRoot "www\progression.js") -Force
Copy-Item (Join-Path $ProjectRoot "hordeheart-model.js") (Join-Path $ProjectRoot "www\hordeheart-model.js") -Force
Copy-Item (Join-Path $ProjectRoot "land-eater-model.js") (Join-Path $ProjectRoot "www\land-eater-model.js") -Force
Copy-Item (Join-Path $ProjectRoot "vendor\three.min.js") (Join-Path $ProjectRoot "www\vendor\three.min.js") -Force

Push-Location $ProjectRoot
try {
  & cap.cmd sync android
  if ($LASTEXITCODE -ne 0) {
    throw "Capacitor sync failed with exit code $LASTEXITCODE."
  }
}
finally {
  Pop-Location
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
      throw "Web asset is out of sync after Capacitor sync: $targetRoot\$assetFile"
    }
  }
}

if (-not $SyncQuiet) {
  Write-Host "Web assets synced to www and Android; SHA-256 parity verified."
}
