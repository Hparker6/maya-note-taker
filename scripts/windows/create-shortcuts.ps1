# Adds "Maya's Notebook" shortcuts to the Desktop and Start menu, with the app icon.
# Pin it to the taskbar from the Start menu: right-click it → Pin to taskbar.
param([string[]]$Destinations)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $Destinations) {
  $Destinations = @(
    [Environment]::GetFolderPath("Desktop"),
    (Join-Path ([Environment]::GetFolderPath("StartMenu")) "Programs")
  )
}

$shell = New-Object -ComObject WScript.Shell
foreach ($folder in $Destinations) {
  New-Item -ItemType Directory -Force -Path $folder | Out-Null
  $shortcut = $shell.CreateShortcut((Join-Path $folder "Maya's Notebook.lnk"))
  $shortcut.TargetPath = Join-Path $env:SystemRoot "System32\wscript.exe"
  $shortcut.Arguments = "`"$Root\scripts\windows\launch.vbs`""
  $shortcut.WorkingDirectory = $Root
  $shortcut.IconLocation = "$Root\public\icons\notebook.ico,0"
  $shortcut.Description = "Open Maya's Notebook"
  $shortcut.Save()
  Write-Host "Added a shortcut in $folder"
}

Write-Host ""
Write-Host "Done. Double-click 'Maya's Notebook' on your Desktop to open it."
Write-Host "To pin it to the taskbar: open Start, find Maya's Notebook, right-click it and choose 'Pin to taskbar'."
