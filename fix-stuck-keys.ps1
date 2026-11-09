# fix-stuck-keys.ps1 - Releases any stuck modifier keys (Windows, Alt, Ctrl, Shift)
Add-Type @"
using System;
using System.Runtime.InteropServices;

public class KeyResetter {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const byte VK_LWIN = 0x5B;
    public const byte VK_RWIN = 0x5C;
    public const byte VK_SHIFT = 0x10;
    public const byte VK_CONTROL = 0x11;
    public const byte VK_MENU = 0x12; // Alt

    public static void ReleaseAllModifiers() {
        // Send key-up for Left & Right Windows keys
        keybd_event(VK_LWIN, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_RWIN, 0, KEYEVENTF_KEYUP, 0);
        // Send key-up for Ctrl, Alt, Shift
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, 0);
    }
}
"@

[KeyResetter]::ReleaseAllModifiers()
Write-Host "All virtual modifier keys (Windows, Ctrl, Alt, Shift) have been released." -ForegroundColor Green
