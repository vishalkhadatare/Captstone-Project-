param(
  [string]$DestinationRoot = 'C:\dev\zeroleak-project'
)

Write-Host 'Killing any processes listening on ports 3000 and 24678...' -ForegroundColor Cyan
$ports = @(3000,24678)
foreach ($port in $ports) {
  try {
    $lines = netstat -ano | findstr ":$port"
  } catch {
    $lines = $null
  }

  if ($lines) {
    $lines -split "`n" | ForEach-Object {
      $line = $_.Trim()
      if ($line -match '\s+(\d+)$') {
        $pid = $matches[1]
        Write-Host 'Killing PID' $pid 'using port' $port -ForegroundColor Yellow
        try {
          taskkill /PID $pid /F | Out-Null
        } catch {
          Write-Host "Failed to kill PID $pid:" -ForegroundColor Red
          Write-Host $_ -ForegroundColor Red
        }
      }
    }
  } else {
    Write-Host 'No listener found on port' $port -ForegroundColor Green
  }
}

# Start the dev server from the destination
if (-not (Test-Path $DestinationRoot)) {
  Write-Host 'Destination root not found:' $DestinationRoot -ForegroundColor Red
  exit 1
}

Write-Host 'Starting dev server in:' $DestinationRoot -ForegroundColor Cyan
Set-Location $DestinationRoot
# Use cmd.exe to run npm so it shows logs in the terminal
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c npm run dev' -WorkingDirectory $DestinationRoot -NoNewWindow -PassThru

Write-Host 'Dev server start command issued. Check that terminal for live logs.' -ForegroundColor Green
