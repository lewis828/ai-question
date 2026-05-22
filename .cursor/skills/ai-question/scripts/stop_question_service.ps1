# Stop QuizAI Python service
$ErrorActionPreference = "Continue"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$servicePidFile = Join-Path $Root "data\quizai.pid"
$stopped = $false

function Stop-ProcessTree($processId) {
    if (-not $processId) { return $false }
    try {
        taskkill /PID $processId /T /F 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Stopped process tree PID $processId"
            return $true
        }
        Stop-Process -Id $processId -Force -ErrorAction Stop
        Write-Host "Stopped process PID $processId"
        return $true
    }
    catch {
        return $false
    }
}

if (Test-Path $servicePidFile) {
    $savedPid = (Get-Content $servicePidFile -Raw).Trim()
    if ($savedPid -match '^\d+$') {
        if (Stop-ProcessTree ([int]$savedPid)) { $stopped = $true }
    }
    Remove-Item $servicePidFile -Force -ErrorAction SilentlyContinue
}

$conns = @(Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue)
foreach ($c in $conns) {
    if (Stop-ProcessTree $c.OwningProcess) { $stopped = $true }
}

if ($stopped) {
    Write-Host "QuizAI service stopped"
}
else {
    Write-Host "No running QuizAI service on port 8000"
}

exit 0
