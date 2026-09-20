$WshShell = New-Object -ComObject WScript.Shell
$TargetPath = Join-Path "$PSScriptRoot" "启动刷题记录本.bat"
$ShortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "刷题记录本.lnk"
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $TargetPath
$Shortcut.WorkingDirectory = Split-Path $TargetPath
$Shortcut.IconLocation = "shell32.dll,14"
$Shortcut.Save()
Write-Host "已在桌面创建快捷方式：$ShortcutPath"
