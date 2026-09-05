param(
  [string]$DestinationRoot = 'C:\dev\zeroleak-project'
)

Write-Host "Starting dev server at: $DestinationRoot" -ForegroundColor Cyan
if (-not (Test-Path $DestinationRoot)) {
  Write-Host "Destination does not exist: $DestinationRoot" -ForegroundColor Red
  exit 1
}

# Stop any node processes that reference the destination path
$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match [regex]::Escape($DestinationRoot) }
if ($procs) {
  foreach ($p in $procs) {
    try { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host "Stopped PID $($p.ProcessId)" -ForegroundColor Yellow } catch {}
  }
}

Push-Location $DestinationRoot
try {
  # Start via cmd.exe to ensure npm runs correctly
  $cmdArgs = '/c npm run dev'
  $proc = Start-Process -FilePath 'cmd.exe' -ArgumentList $cmdArgs -WorkingDirectory $DestinationRoot -PassThru
  Write-Host "Started dev server (PID: $($proc.Id)). Check logs in that terminal or visit http://localhost:3000" -ForegroundColor Green
} catch {
  Write-Host "Failed to start dev server: $_" -ForegroundColor Red
  exit 1
} finally {
  Pop-Location
}

Write-Host "Done." -ForegroundColor Cyan
