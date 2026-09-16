# Stops Houston's Little Surprise if it's running in the background (started by the desktop shortcut).
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Port = if ($env:NOTEBOOK_PORT) { [int]$env:NOTEBOOK_PORT } else { 3000 }

$listeners = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if (-not $listeners) {
  Write-Host "Houston's Little Surprise isn't running."
  exit 0
}

foreach ($owner in ($listeners.OwningProcess | Sort-Object -Unique)) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $owner"
  # Only stop the notebook's own server, never some other app on the same port.
  if ($process -and $process.CommandLine -match "next" -and $process.CommandLine -like "*$Root*") {
    # The server runs under npm and cmd; stop the whole chain.
    $chain = @($process)
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.ParentProcessId)"
    while ($parent -and $parent.CommandLine -match "npm|next|cmd.exe") {
      $chain += $parent
      $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($parent.ParentProcessId)"
    }
    foreach ($p in $chain) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
    Write-Host "Stopped Houston's Little Surprise."
  } else {
    Write-Host "Something else is using port $Port, so nothing was stopped."
  }
}
