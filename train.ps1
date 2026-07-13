# PowerShell Headless Training Script
# Runs the Lazer Showdown ExpectedDQN continuous training loop in the background

$scriptName = "scripts/train.js"

# Parameters
$iterations = 500
$games = 100

# Logs
$logFile = "training_log.txt"
$errorFile = "training_error.txt"

Write-Host "🚀 Launching headless training process..."
Write-Host "Iterations: $iterations | Games per iteration: $games"
Write-Host "Output will be piped to $logFile"
Write-Host "Errors will be piped to $errorFile"
Write-Host "To monitor progress, you can run: Get-Content $logFile -Tail 10 -Wait"

# Run node in background
Start-Process -FilePath "node" -ArgumentList "$scriptName --iterations=$iterations --games=$games" -RedirectStandardOutput $logFile -RedirectStandardError $errorFile -WindowStyle Hidden

Write-Host "✅ Process detached successfully. You may close this terminal."
