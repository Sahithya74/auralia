<#
.SYNOPSIS
  Shares Anbu at a public https link from this PC.

.DESCRIPTION
  Starts the production server, a self-reconnecting Pinggy tunnel and a
  keep-awake helper as background processes. They keep running after this
  window, VS Code or any terminal is closed, and the server restarts itself if
  it stops. Run the script again to see the current link.

  From the project folder:
    powershell -ExecutionPolicy Bypass -File scripts\share.ps1          start, or show the current link
    powershell -ExecutionPolicy Bypass -File scripts\share.ps1 -Stop    stop everything it started

  Free Pinggy links expire after 60 minutes. The tunnel then reconnects with a
  new address; run the script again to see it. Keep the PC plugged in, online
  and the lid open.
#>
param(
  [switch]$Stop,
  [string]$StateDir = (Join-Path $env:LOCALAPPDATA 'Anbu\share'),
  [ValidateSet('', 'server', 'tunnel', 'awake')]
  [string]$Role = ''
)

$root = Split-Path -Parent $PSScriptRoot
$port = 4200
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
$pidsFile = Join-Path $StateDir 'pids.json'
$serverLog = Join-Path $StateDir 'server.log'
$tunnelLog = Join-Path $StateDir 'tunnel.log'

function Limit-Log($path) {
  # Keeps logs from growing without bound on long runs.
  if ((Test-Path $path) -and (Get-Item $path).Length -gt 5MB) { Clear-Content $path }
}

# ------------------------------------------------------------ background roles

if ($Role -eq 'server') {
  Set-Location (Join-Path $root 'server')
  while ($true) {
    Limit-Log $serverLog
    "$(Get-Date -Format s) starting the server on port $port" | Add-Content $serverLog
    cmd.exe /d /c "set NODE_ENV=production&& set PORT=$port&& set TRUST_PROXY=1&& set COOKIE_SECURE=true&& node --import tsx src/index.ts >> `"$serverLog`" 2>&1"
    "$(Get-Date -Format s) the server stopped (exit code $LASTEXITCODE); restarting in 5 s" | Add-Content $serverLog
    Start-Sleep -Seconds 5
  }
}

if ($Role -eq 'tunnel') {
  $key = Join-Path $StateDir 'tunnel_key'
  if (-not (Test-Path $key)) { cmd.exe /d /c "ssh-keygen -q -t ed25519 -N `"`" -f `"$key`"" | Out-Null }
  while ($true) {
    Limit-Log $tunnelLog
    "--- connecting $(Get-Date -Format s)" | Add-Content $tunnelLog
    cmd.exe /d /c "ssh -T -p 443 -i `"$key`" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=`"$StateDir\known_hosts`" -o BatchMode=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -o ExitOnForwardFailure=yes -R0:localhost:$port free.pinggy.io >> `"$tunnelLog`" 2>&1"
    "--- disconnected $(Get-Date -Format s), reconnecting" | Add-Content $tunnelLog
    Start-Sleep -Seconds 3
  }
}

if ($Role -eq 'awake') {
  Add-Type -Namespace AnbuShare -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
  while ($true) {
    # ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED: no idle sleep while this runs.
    [void][AnbuShare.Power]::SetThreadExecutionState([uint32]'0x80000003')
    Start-Sleep -Seconds 60
  }
}

# ------------------------------------------------------------ helpers

function Get-Pids {
  if (Test-Path $pidsFile) { return Get-Content $pidsFile -Raw | ConvertFrom-Json }
  return New-Object psobject
}

function Test-Role($id) {
  # The id must still belong to one of this script's processes (ids are reused).
  if (-not $id) { return $false }
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$id" -ErrorAction SilentlyContinue
  return [bool]($p -and $p.CommandLine -like '*share.ps1*')
}

function Test-Port($hostName, $portNumber) {
  $client = New-Object System.Net.Sockets.TcpClient
  try { return $client.ConnectAsync($hostName, $portNumber).Wait(1000) -and $client.Connected }
  catch { return $false }
  finally { $client.Dispose() }
}

function Start-Detached($commandLine, $directory) {
  # Started through WMI so the process is not tied to this window or terminal.
  # The console is hidden from the start: a visible one is handed to the default
  # terminal app, which closes it (and everything in it) within seconds.
  $hidden = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
  $result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = $commandLine; CurrentDirectory = $directory; ProcessStartupInformation = $hidden
  }
  if ($result.ReturnValue -ne 0) { throw "Could not start: $commandLine" }
  return [int]$result.ProcessId
}

function Get-Link {
  if (-not (Test-Path $tunnelLog)) { return $null }
  $found = Select-String -Path $tunnelLog -Pattern 'https://[a-z0-9-]+\.free\.pinggy\.net' -AllMatches | Select-Object -Last 1
  if ($found) { return $found.Matches[$found.Matches.Count - 1].Value }
  return $null
}

# ------------------------------------------------------------ stop

if ($Stop) {
  $pids = Get-Pids
  $stopped = 0
  foreach ($name in 'server', 'tunnel', 'awake') {
    $id = $pids.$name
    if (Test-Role $id) {
      taskkill /PID $id /T /F | Out-Null
      Write-Host "Stopped the $name."
      $stopped++
    }
  }
  Remove-Item $pidsFile -ErrorAction SilentlyContinue
  if ($stopped -eq 0) { Write-Host 'Nothing was running.' }
  Write-Host 'The database was left running (stop it from the XAMPP Control Panel if you like).'
  return
}

# ------------------------------------------------------------ start

$ErrorActionPreference = 'Stop'
$pids = Get-Pids

# 1. Database
$dbLine = (Select-String -Path (Join-Path $root 'server\.env') -Pattern '^DATABASE_URL=' | Select-Object -First 1).Line
$dbHost = '127.0.0.1'; $dbPort = 3306
if ($dbLine -match '@([^:/]+):(\d+)/') { $dbHost = $Matches[1]; $dbPort = [int]$Matches[2] }
if (-not (Test-Port $dbHost $dbPort)) {
  $mysqld = 'C:\xampp\mysql\bin\mysqld.exe'
  if (Test-Path $mysqld) {
    Write-Host "Starting the XAMPP database on port $dbPort..."
    Start-Detached "`"$mysqld`" --defaults-file=C:\xampp\mysql\bin\my.ini --standalone" 'C:\xampp' | Out-Null
    for ($i = 0; $i -lt 30 -and -not (Test-Port $dbHost $dbPort); $i++) { Start-Sleep -Seconds 1 }
  }
  if (-not (Test-Port $dbHost $dbPort)) {
    throw "The database at ${dbHost}:$dbPort is not running. Start MySQL in the XAMPP Control Panel, then run this again."
  }
}

# 2. App build
if (-not (Test-Path (Join-Path $root 'client\dist\index.html'))) {
  Write-Host 'Building the app (first run only)...'
  Push-Location (Join-Path $root 'client')
  try { npm run build | Out-Host } finally { Pop-Location }
}

# 3. Background processes
if (-not (Test-Role $pids.server) -and (Test-Port '127.0.0.1' $port)) {
  throw "Port $port is already used by another program. Close it, then run this again."
}
$self = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" -StateDir `"$StateDir`" -Role"
$linkBefore = Get-Link
$startedTunnel = $false
foreach ($name in 'server', 'tunnel', 'awake') {
  if (-not (Test-Role $pids.$name)) {
    $id = Start-Detached "$self $name" $root
    $pids | Add-Member -Force -NotePropertyName $name -NotePropertyValue $id
    if ($name -eq 'tunnel') { $startedTunnel = $true }
    Write-Host "Started the $name."
  }
}
$pids | ConvertTo-Json | Set-Content $pidsFile

# 4. Wait until it answers, locally and through the link
Write-Host 'Waiting for the server (the first start after a restart can take a minute or two)...'
$healthy = $false
for ($i = 0; $i -lt 180 -and -not $healthy; $i++) {
  try { $healthy = (Invoke-RestMethod "http://localhost:$port/api/health" -TimeoutSec 3).status -eq 'ok' } catch { Start-Sleep -Seconds 1 }
}
if (-not $healthy) { throw "The server did not start. See $serverLog" }

$link = Get-Link
for ($i = 0; $i -lt 40 -and (-not $link -or ($startedTunnel -and $link -eq $linkBefore)); $i++) {
  Start-Sleep -Seconds 1
  $link = Get-Link
}
if (-not $link) { throw "The public link did not open. See $tunnelLog" }

Write-Host ''
Write-Host 'Anbu is running.'
Write-Host "  Public link : $link"
Write-Host "  On this PC  : http://localhost:$port"
Write-Host "  Logs        : $StateDir"
Write-Host '  Stop        : powershell -ExecutionPolicy Bypass -File scripts\share.ps1 -Stop'
Write-Host ''
Write-Host 'Free links change about every 60 minutes; run this script again to see the current one.'
Write-Host 'Keep this PC plugged in, online and the lid open.'
