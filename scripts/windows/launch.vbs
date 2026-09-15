' Runs launch.ps1 without flashing a console window. Used by the desktop and Start menu shortcuts.
Set shell = CreateObject("WScript.Shell")
folder = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & folder & "\launch.ps1""", 0, False
