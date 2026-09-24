' Spotify x Wallpaper Engine Sync - Background Daemon Launcher
' Developed & Re-engineered by Harilowji (https://github.com/Harilowji)
' Silently starts the WESyncServer loop in the background with no console window.

Set objShell = CreateObject("WScript.Shell")
strAppData = objShell.ExpandEnvironmentStrings("%APPDATA%")
strBatchPath = strAppData & "\WESync\WESyncServer_Loop.bat"

objShell.Run "cmd /c """ & strBatchPath & """", 0, False
