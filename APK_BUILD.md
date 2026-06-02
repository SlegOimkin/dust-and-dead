# Сборка APK

Игра остается обычным статическим сайтом: `index.html`, `styles.css`, `game.js` и `vendor/three.min.js` запускаются напрямую через браузер без сервера. APK собирается как Android-обертка Capacitor вокруг этих файлов.

## Шаги

Из корня проекта `D:\TestProject`:

```powershell
New-Item -ItemType Directory -Path "www\vendor" -Force | Out-Null
Copy-Item "index.html" "www\index.html" -Force
Copy-Item "styles.css" "www\styles.css" -Force
Copy-Item "game.js" "www\game.js" -Force
Copy-Item "vendor\three.min.js" "www\vendor\three.min.js" -Force
.\node_modules\.bin\cap.cmd sync android
```

Затем собрать debug APK:

```powershell
$env:JAVA_HOME = "D:\TestProject\.tools\jdk\extracted\jdk-21.0.11+10"
$env:ANDROID_HOME = "D:\TestProject\.tools\android-sdk"
$env:ANDROID_SDK_ROOT = "D:\TestProject\.tools\android-sdk"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:Path"

Set-Location "D:\TestProject\android"
.\gradlew.bat assembleDebug
Set-Location "D:\TestProject"
Copy-Item "android\app\build\outputs\apk\debug\app-debug.apk" "DustAndDead-debug.apk" -Force
```

Проверка подписи:

```powershell
& "D:\TestProject\.tools\android-sdk\build-tools\36.0.0\apksigner.bat" verify --verbose "DustAndDead-debug.apk"
```

`DustAndDead-debug.apk` нужен только для локальной проверки и установки на телефон. В GitHub он не добавляется.
