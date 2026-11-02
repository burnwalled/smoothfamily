# Sleep helper for the local AI computer (Windows) – see docs/LOCAL_AI.md.
#
# Run it every 5 minutes as a scheduled task. It puts the computer to sleep only when:
#   - Smooth Family woke it (Wake-on-LAN),
#   - the AI queue has been empty for a while, and
#   - nobody has touched the keyboard or mouse for a while.
# If you are using the computer, nothing happens.
#
#   powershell -ExecutionPolicy Bypass -File ai-sleep-helper.ps1 -HelperUrl "https://.../api/ai/helper?key=..."
param(
    [Parameter(Mandatory = $true)][string]$HelperUrl,
    [int]$QueueEmptyMinutes = 10,
    [int]$UserIdleMinutes = 15
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Idle {
    [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
    [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO info);
    public static double Minutes() {
        var info = new LASTINPUTINFO(); info.cbSize = (uint)Marshal.SizeOf(info);
        GetLastInputInfo(ref info);
        return (Environment.TickCount - (int)info.dwTime) / 60000.0;
    }
}
"@

try {
    $state = Invoke-RestMethod -Uri $HelperUrl -TimeoutSec 15
} catch {
    exit 0  # the server can't be reached: leave the computer alone
}

if (-not $state.woken_by_server -or $state.busy) { exit 0 }
if ($state.queue_empty_since) {
    $emptyFor = ((Get-Date).ToUniversalTime() - ([datetime]$state.queue_empty_since).ToUniversalTime()).TotalMinutes
    if ($emptyFor -lt $QueueEmptyMinutes) { exit 0 }
}
if ([Idle]::Minutes() -lt $UserIdleMinutes) { exit 0 }

# Tell the server first (so it doesn't think it should stay awake), then sleep.
$slept = $HelperUrl -replace "/api/ai/helper\?", "/api/ai/helper/slept?"
try { Invoke-RestMethod -Method Post -Uri $slept -TimeoutSec 15 | Out-Null } catch { }
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false) | Out-Null
