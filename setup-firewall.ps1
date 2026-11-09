# OmniDrop Firewall Setup
# Run this script once as Administrator to allow your phone to reach the PC

$ruleName = "OmniDrop Port 5050"

# Remove old rule if exists
Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

# Add new inbound TCP rule for port 5050
New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort 5050 `
    -Action Allow `
    -Profile Private,Domain,Public `
    -Description "OmniDrop file transfer app - allow phone to reach PC on port 5050"

Write-Host ""
Write-Host "SUCCESS: Firewall rule added for port 5050" -ForegroundColor Green
Write-Host ""
Write-Host "Your Wi-Fi IP addresses:" -ForegroundColor Cyan
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "192.168.*" } | ForEach-Object {
    Write-Host "  http://$($_.IPAddress):5050" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Scan the QR code on the OmniDrop page, or type one of the above URLs in your phone browser." -ForegroundColor White
Write-Host ""
pause
