# Export the live customer data from the old Firebase Realtime Database.
# Usage: right-click this file > Run with PowerShell (or run .\export-live-data.ps1
# in a PowerShell window). Type the login when prompted — the SAME email and
# password used on the capital.ergroup.info login page (NOT the Gmail password,
# unless they happen to be the same).
# Output: live-users.json in the same folder as this script.

$apiKey = "AIzaSyAYSU90V1qXd7yYf7qIDfes-dekdnbu3BE"   # public web API key from the old site
$dbUrl  = "https://capital-7c93a.firebaseio.com"

$email    = Read-Host "Website login email (e.g. capitalng1001@gmail.com)"
$password = Read-Host "Website login password"

Write-Host "Signing in..."
try {
    $signIn = Invoke-RestMethod -Method Post `
        -Uri "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$apiKey" `
        -ContentType "application/json" `
        -Body (@{ email = $email; password = $password; returnSecureToken = $true } | ConvertTo-Json)
} catch {
    $reason = ""
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reason = ($reader.ReadToEnd() | ConvertFrom-Json).error.message
    }
    Write-Host ""
    Write-Host "SIGN-IN FAILED: $reason" -ForegroundColor Red
    switch ($reason) {
        "INVALID_PASSWORD" { Write-Host "The email exists but this password is wrong. Use the password that works on the capital.ergroup.info login page." }
        "EMAIL_NOT_FOUND"  { Write-Host "No website account with this email. Check the spelling." }
        "USER_DISABLED"    { Write-Host "This account has been disabled." }
        default            { Write-Host "Unexpected error - copy this message to Claude." }
    }
    exit 1
}

Write-Host "Signed in as $($signIn.email). Downloading /users (may take a minute)..."
$outFile = Join-Path $PSScriptRoot "live-users.json"
try {
    Invoke-WebRequest -Uri "$dbUrl/users.json?auth=$($signIn.idToken)" -OutFile $outFile -TimeoutSec 600
} catch {
    Write-Host "DOWNLOAD FAILED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$size = [Math]::Round((Get-Item $outFile).Length / 1MB, 2)
Write-Host ""
Write-Host "SUCCESS. Saved $size MB to $outFile" -ForegroundColor Green
