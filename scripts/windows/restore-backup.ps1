# Puts an earlier copy of the notebook back. Backups are made automatically (data\backups): shortly
# after the app starts, about once a day, and before any update that changes the database.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$DataDir = if ($env:DATA_DIR) { $env:DATA_DIR } else { Join-Path $Root "data" }
$Db = Join-Path $DataDir "maya.db"
$BackupDir = Join-Path $DataDir "backups"
$Port = if ($env:NOTEBOOK_PORT) { [int]$env:NOTEBOOK_PORT } else { 3000 }

if (-not (Test-Path $BackupDir)) {
  Write-Host "There are no backups yet ($BackupDir doesn't exist)." -ForegroundColor Yellow
  exit 1
}
$backups = Get-ChildItem $BackupDir -Filter "maya-*.db" | Sort-Object LastWriteTime -Descending
if (-not $backups) {
  Write-Host "There are no backups in $BackupDir yet." -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "Backups of your notebook (newest first):" -ForegroundColor Cyan
for ($i = 0; $i -lt $backups.Count; $i++) {
  $b = $backups[$i]
  $note = if ($b.Name -match "-before-update\.db$") { "  (taken before an update)" } elseif ($b.Name -match "-before-restore\.db$") { "  (taken before an earlier restore)" } else { "" }
  "{0,3}. {1}  {2,8:N1} MB{3}" -f ($i + 1), $b.LastWriteTime.ToString("ddd d MMM yyyy, HH:mm"), ($b.Length / 1MB), $note
}
Write-Host ""
Write-Host "Restoring replaces everything you have now — notes, handwriting, flashcards, quizzes and study history —"
Write-Host "with the copy from that moment. Anything written since then is not in it. (Your PDFs are not affected.)"
$answer = Read-Host "Type the number to restore, or press Enter to cancel"
if (-not $answer) { Write-Host "Nothing was changed."; exit 0 }
$index = 0
if (-not [int]::TryParse($answer, [ref]$index) -or $index -lt 1 -or $index -gt $backups.Count) {
  Write-Host "That isn't one of the numbers above. Nothing was changed." -ForegroundColor Yellow
  exit 1
}
$chosen = $backups[$index - 1]
if ((Read-Host "Restore the copy from $($chosen.LastWriteTime.ToString('ddd d MMM, HH:mm'))? Type YES to confirm") -ne "YES") {
  Write-Host "Nothing was changed."
  exit 0
}

# The app must not be running, or it would keep writing to the file being replaced.
$listeners = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($listeners) {
  Write-Host "Closing the notebook first..."
  & (Join-Path $PSScriptRoot "stop.ps1") | Out-Null
  Start-Sleep -Seconds 2
  if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
    Write-Host "The notebook is still running. Close it (npm run stop) and try again." -ForegroundColor Yellow
    exit 1
  }
}

# Keep what's there now, so a restore can itself be undone.
if (Test-Path $Db) {
  $stamp = (Get-Date).ToString("yyyy-MM-ddTHH-mm-ss")
  $safety = Join-Path $BackupDir "maya-$stamp-before-restore.db"
  Copy-Item $Db $safety
  foreach ($suffix in "-wal", "-shm") {
    $extra = "$Db$suffix"
    if (Test-Path $extra) { Copy-Item $extra "$safety$suffix" }
  }
  Write-Host "Kept what you have now as $(Split-Path $safety -Leaf)."
}

foreach ($suffix in "", "-wal", "-shm") { Remove-Item "$Db$suffix" -Force -ErrorAction SilentlyContinue }
Copy-Item $chosen.FullName $Db
Write-Host ""
Write-Host "Restored the copy from $($chosen.LastWriteTime.ToString('ddd d MMM yyyy, HH:mm'))." -ForegroundColor Green
Write-Host "Open Maya's Notebook again to use it."
