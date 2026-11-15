# Read-only local Windows Event Log triage for ASEN Pi native 0xC0000409.
# Never starts/retries an agent. Never exports WER files, raw messages,
# command lines, process paths, prompt text, credentials or environment.
[CmdletBinding()]
param(
    [ValidateRange(1, 168)][int]$LookbackHours = 48,
    [ValidateRange(1, 300)][int]$MaxEvents = 100
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$code = "0xC0000409"
$since = (Get-Date).AddHours(-$LookbackHours)
$scanned = 0
$matches = @()
$events = @()
try {
    $events = @(Get-WinEvent -FilterHashtable @{
        LogName = "Application"
        Id = @(1000, 1001)
        StartTime = $since
    } -MaxEvents $MaxEvents -ErrorAction Stop)
} catch {
    # The log may be empty or access denied. Report availability, not raw error text.
    [pscustomobject]@{
        schema = "asen.native-wer-triage/v1"
        status = "unavailable"
        reason = "Windows Application WER events could not be read; check permissions and log availability"
        scanned = 0
        matches = @()
    } | ConvertTo-Json -Depth 5
    exit 2
}
foreach ($event in $events) {
    $scanned++
    # Keep the raw localized event description only in memory.
    $message = [string]$event.Message
    if ($message -notmatch '(?i)0xC0000409') { continue }
    if ($message -notmatch '(?i)(node\.exe|pi\.exe|pi-coding-agent)') { continue }
    $module = "unavailable"
    if ($message -match '(?im)(?:Faulting module name|Nombre del m[oó]dulo con errores|Fault module name)\s*:\s*([^,\r\n]+)') {
        $rawModule = [string]$Matches[1]
        $baseName = ($rawModule -replace '^.*[\\/]', '').Trim()
        # Only publish a constrained filename, never a path or arbitrary message.
        if ($baseName -match '^[a-zA-Z0-9_.-]{1,100}\.(?:dll|exe|node)$') {
            $module = $baseName
        }
    }
    $matches += [pscustomobject]@{
        timeUtc = $event.TimeCreated.ToUniversalTime().ToString("o")
        eventId = [int]$event.Id
        provider = if ($event.ProviderName -in @("Application Error", "Windows Error Reporting")) { [string]$event.ProviderName } else { "other" }
        nativeStatus = $code
        moduleFileName = $module
    }
}
[pscustomobject]@{
    schema = "asen.native-wer-triage/v1"
    status = "read-only"
    scanned = $scanned
    matches = @($matches)
    interpretation = "Matching events are clues only. A module name is not sufficient to establish causality."
} | ConvertTo-Json -Depth 6
