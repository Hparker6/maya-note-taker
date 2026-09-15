# Opens Maya's Notebook: starts the app in the background if it isn't running (building it first
# after a fresh download or an update), then opens it in its own window like a desktop app.
param([switch]$NoBrowser)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Port = if ($env:NOTEBOOK_PORT) { $env:NOTEBOOK_PORT } else { "3000" }
$Url = "http://localhost:$Port"
$DistDir = if ($env:NEXT_DIST_DIR) { $env:NEXT_DIST_DIR } else { ".next" }
$DataDir = if ($env:DATA_DIR) { $env:DATA_DIR } else { Join-Path $Root "data" }
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
$Log = Join-Path $DataDir "server.log"

Add-Type -AssemblyName PresentationFramework
function Show-Problem([string]$Message) {
  [System.Windows.MessageBox]::Show($Message, "Maya's Notebook", "OK", "Warning") | Out-Null
}

function Test-Running {
  try {
    Invoke-WebRequest -Uri "$Url/manifest.webmanifest" -UseBasicParsing -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Show-Problem "Node.js isn't installed. Install the LTS version from nodejs.org, then open the notebook again."
  exit 1
}

if (-not (Test-Running)) {
  # Build when there's no build yet, or the code changed since the last one (e.g. after git pull).
  $buildId = Join-Path $Root "$DistDir\BUILD_ID"
  $lastCommit = 0
  try { $lastCommit = [int64](git -C $Root log -1 --format=%ct 2>$null) } catch {}
  $builtAt = if (Test-Path $buildId) { [DateTimeOffset]::new((Get-Item $buildId).LastWriteTimeUtc).ToUnixTimeSeconds() } else { 0 }
  $needsInstall = -not (Test-Path (Join-Path $Root "node_modules")) -or
    ((Test-Path (Join-Path $Root "node_modules\.package-lock.json")) -and
     (Get-Item (Join-Path $Root "package-lock.json")).LastWriteTimeUtc -gt (Get-Item (Join-Path $Root "node_modules\.package-lock.json")).LastWriteTimeUtc)

  if ($needsInstall -or $builtAt -lt $lastCommit) {
    $steps = if ($needsInstall) { "npm install && npm run build" } else { "npm run build" }
    $setup = Start-Process -FilePath "cmd.exe" -WorkingDirectory $Root -Wait -PassThru -ArgumentList "/c", "title Setting up Maya's Notebook && echo Getting Maya's Notebook ready. The first time takes a few minutes... && $steps"
    if ($setup.ExitCode -ne 0) {
      Show-Problem "Setup didn't finish. Open a terminal in the maya-note-taker folder and run 'npm install' and then 'npm run build' to see what went wrong."
      exit 1
    }
  }

  Start-Process -FilePath "cmd.exe" -WorkingDirectory $Root -WindowStyle Hidden -ArgumentList "/c", "npm start -- -p $Port > `"$Log`" 2>&1"
  $deadline = (Get-Date).AddSeconds(120)
  while (-not (Test-Running)) {
    if ((Get-Date) -gt $deadline) {
      Show-Problem "The notebook didn't start. Details are in data\server.log."
      exit 1
    }
    Start-Sleep -Milliseconds 500
  }
}

if ($NoBrowser) { exit 0 }

# An app window (no tabs or address bar) in Edge or Chrome; otherwise the default browser.
$browser = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if ($browser) {
  Start-Process -FilePath $browser -ArgumentList "--app=$Url"
} else {
  Start-Process $Url
}
