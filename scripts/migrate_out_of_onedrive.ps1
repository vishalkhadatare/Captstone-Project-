<#
migrate_out_of_onedrive.ps1

Stops any running Node processes associated with this project, copies the project
(to C:\dev\zeroleak-project by default) excluding any *.tmp files, and starts
`npm run dev` from the new location. Does NOT delete or modify the original.

Usage: run from the project root in PowerShell as:
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force; .\scripts\migrate_out_of_onedrive.ps1

#>
param(
  [string]$DestinationRoot = 'C:\dev\zeroleak-project'
)

Write-Host "Starting migration script..." -ForegroundColor Cyan

# Resolve current project path
$CurrentPath = (Get-Location).Path
Write-Host "Project source: $CurrentPath"
Write-Host "Destination: $DestinationRoot"

# 1) Stop Node processes that mention this project path in their command line
Write-Host "Looking for Node processes referencing this project..." -ForegroundColor Yellow
$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match [regex]::Escape($CurrentPath) }
if ($procs) {
  foreach ($p in $procs) {
    try {
      Write-Host "Stopping PID $($p.ProcessId): $($p.CommandLine)" -ForegroundColor Yellow
      Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    } catch {
      Write-Host "Failed to stop PID $($p.ProcessId): $_" -ForegroundColor Red
    }
  }
} else {
  Write-Host "No project-specific Node processes found. Proceeding..." -ForegroundColor Green
}

# 2) Create destination root
if (-not (Test-Path -Path $DestinationRoot)) {
  try {
    New-Item -ItemType Directory -Path $DestinationRoot -Force | Out-Null
    Write-Host "Created destination folder: $DestinationRoot" -ForegroundColor Green
  } catch {
    Write-Host "Failed to create destination folder: $_" -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host "Destination folder already exists: $DestinationRoot" -ForegroundColor Yellow
}

# Build robocopy command to copy everything but *.tmp files
$src = $CurrentPath.TrimEnd('\')
$dst = $DestinationRoot.TrimEnd('\')

# Use Robocopy for robust copying (preserve attributes). /MIR not used to avoid deleting.
$robocopyArgs = "`"$src`" `"$dst`" /E /COPYALL /R:2 /W:2 /MT:16 /XF *.tmp"
Write-Host "Running robocopy to copy project (this can take a while for node_modules)..." -ForegroundColor Cyan
Write-Host "robocopy $robocopyArgs"

# Use cmd.exe /c to run robocopy with a single combined argument string to avoid Start-Process quoting issues.
$robocopyCmd = "robocopy `"$src`" `"$dst`" /E /COPY:DAT /R:2 /W:2 /MT:16 /XF *.tmp"
$cmdArgs = "/c $robocopyCmd"
$proc = Start-Process -FilePath 'cmd.exe' -ArgumentList $cmdArgs -Wait -NoNewWindow -PassThru

# Robocopy returns exit codes via the process ExitCode
if ($proc.ExitCode -gt 7) {
  Write-Host "Robocopy reported an error. Exit code: $($proc.ExitCode)" -ForegroundColor Red
  Write-Host "Aborting migration to avoid partial copy." -ForegroundColor Red
  exit 1
} else {
  Write-Host "Robocopy finished with exit code $($proc.ExitCode)" -ForegroundColor Green
}

# 3) Confirm the sqlite file was copied
$sqliteName = 'zeroleak_data.sqlite'
$srcSql = Join-Path $src $sqliteName
$dstSql = Join-Path $dst $sqliteName
if (Test-Path $dstSql) {
  Write-Host "Database file present in destination: $dstSql" -ForegroundColor Green
} else {
  Write-Host "Warning: Database file not found in destination. Looking for it in source..." -ForegroundColor Yellow
  if (Test-Path $srcSql) { Write-Host "Source DB exists at $srcSql" -ForegroundColor Yellow }
}

# 4) Print instructions to user before starting dev server
Write-Host "\nMigration complete. The project has been copied to: $dst" -ForegroundColor Cyan
Write-Host "DO NOT delete the original OneDrive folder; it remains intact as backup." -ForegroundColor Yellow
Write-Host "Recommended next steps:" -ForegroundColor Cyan
Write-Host " - Open VS Code and open folder: $dst" -ForegroundColor White
Write-Host " - Add $dst to Windows Defender / antivirus exclusions if applicable" -ForegroundColor White
Write-Host " - If you want, the script will now start the dev server from the new location to verify it runs." -ForegroundColor White

# 5) Start dev server from the destination (optional confirmation)
$startNow = Read-Host "Start dev server now from the new location? (Y/N)"
if ($startNow -match '^[Yy]') {
  Write-Host "Starting dev server in background at: $dst" -ForegroundColor Cyan
  Push-Location $dst
  # Ensure process will run even after this script ends
  $npmPath = Get-Command npm -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue
  if (-not $npmPath) { Write-Host "npm not found in PATH. Please ensure Node.js is installed and npm is available." -ForegroundColor Red; exit 1 }

  $proc = Start-Process -FilePath $npmPath -ArgumentList 'run','dev' -WorkingDirectory $dst -NoNewWindow -PassThru
  Write-Host "Dev server started (PID: $($proc.Id)). Check logs in the terminal or visit http://localhost:3000" -ForegroundColor Green
  Pop-Location
} else {
  Write-Host "Skipping dev server start. You can start it manually with:`n  cd $dst`n  npm run dev" -ForegroundColor Yellow
}

Write-Host "Script finished." -ForegroundColor Cyan
