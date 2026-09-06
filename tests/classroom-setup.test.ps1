[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$PackagePath)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('classroom-session-test-' + [Guid]::NewGuid().ToString('N'))
$managedNames = @('UPSTAGE_API_KEY', 'MINDLOGIC_API_KEY', 'TAVILY_API_KEY', 'UNSTRUCTURED_API_KEY',
    'GJC_CODING_AGENT_DIR', 'PI_CODING_AGENT_DIR')
$previous = @{}
foreach ($name in $managedNames) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
}
$originalLocation = Get-Location
New-Item -ItemType Directory -Path $fixture -Force | Out-Null
$success = $false
try {
    $env:GJC_CODING_AGENT_DIR = Join-Path $fixture 'gjc-agent'
    $env:PI_CODING_AGENT_DIR = Join-Path $fixture 'pi-agent'
    Set-Location -LiteralPath $fixture
    $options = @{
        NonInteractive = $true
        SessionDestinationDirectory = (Join-Path $fixture 'SessionCommands')
        SessionProfilePath = @((Join-Path $fixture 'Documents\WindowsPowerShell\profile.ps1'))
    }
    $output = & (Join-Path $PackagePath 'Start-Classroom-Setup.ps1') @options *>&1 | Out-String
    if ($output -match 'FAIL|Error:') { throw 'Setup reported a failure.' }
    foreach ($name in @('gjc', 'pi', 'Show-ClassroomStatus', 'Open-ClassroomGuest')) {
        if ((Get-Command $name).CommandType -ne 'Function') { throw "Same-window function missing: $name" }
    }
    $module = Get-Module Session-Keys
    & $module {
        $script:FixturePromptIndex = 0
        $script:PromptReader = {
            param([string]$Message)
            $script:FixturePromptIndex++
            ConvertTo-SecureString -String ('fixture-window-key-' + $script:FixturePromptIndex) -AsPlainText -Force
        }
    }
    $keyOutput = Set-ClassroomSessionKeys *>&1 | Out-String
    $state = @(Get-ClassroomSessionKeyStatus)
    if ($state.Count -ne 4 -or @($state | Where-Object Status -ne '설정됨').Count -ne 0) {
        throw 'All four keys must be available in the same PowerShell window.'
    }
    $solar = gjc --list-models solar 2>&1 | Out-String
    if ($solar -notmatch 'upstage\s+solar-pro4\s+.*minimal,low,medium,high,xhigh,max') {
        throw 'Real GJC did not resolve Solar Max with the session-only key.'
    }
    $luna = gjc --list-models luna 2>&1 | Out-String
    if ($luna -notmatch 'mindlogic-luna\s+gpt-5\.6-luna\s+.*low,medium,high,xhigh') {
        throw 'Real GJC did not resolve the session-only Mindlogic selectors.'
    }
    $prompts = & $module { $script:FixturePromptIndex }
    if ($prompts -ne 4) { throw 'Same-window launches unexpectedly asked for the keys again.' }
    foreach ($name in $managedNames | Where-Object { $_ -like '*API_KEY' }) {
        if ([Environment]::GetEnvironmentVariable($name, 'Process')) {
            throw 'A session key remains in the parent environment after GJC exit.'
        }
    }
    if (($output + $keyOutput + $solar + $luna) -match 'fixture-window-key-') { throw 'A fake secret leaked into output.' }
    foreach ($file in Get-ChildItem -LiteralPath $fixture -File -Recurse) {
        if ([Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($file.FullName)).Contains('fixture-window-key-')) {
            throw 'A fake key was persisted to a fixture file.'
        }
    }
    if (Test-Path -LiteralPath (Join-Path $env:GJC_CODING_AGENT_DIR '.env')) { throw 'Setup created a .env file.' }
    $guestCalls = New-Object Collections.ArrayList
    function global:Start-Process {
        param($FilePath, $ArgumentList, $WindowStyle)
        [void]$guestCalls.Add(@{ Path = $FilePath; Arguments = $ArgumentList; Style = $WindowStyle })
    }
    try { Open-ClassroomGuest | Out-Null }
    finally { Remove-Item Function:\Start-Process -Force }
    if ($guestCalls.Count -ne 1 -or $guestCalls[0].Arguments -notcontains '--guest' -or $guestCalls[0].Style -ne 'Normal') {
        throw 'Chrome Guest launch did not use the expected visible Guest flags.'
    }
    Clear-ClassroomSessionKeys | Out-Null
    if (@(Get-ClassroomSessionKeyStatus | Where-Object Status -eq '설정됨').Count -ne 0) { throw 'Clear did not empty the cache.' }
    Remove-Module Session-Keys -Force
    Import-Module (Join-Path $options.SessionDestinationDirectory 'Session-Keys.psm1') -Global
    if (@(Get-ClassroomSessionKeyStatus | Where-Object Status -eq '설정됨').Count -ne 0) { throw 'A fresh module retained a key.' }
    $cmdFiles = @(Get-ChildItem -LiteralPath $PackagePath -Filter '*.cmd' -File)
    if ($cmdFiles.Count -ne 1 -or $cmdFiles[0].Name -ne '01-Install.cmd') { throw 'There must be exactly one CMD entry point.' }
    $entry = [IO.File]::ReadAllText($cmdFiles[0].FullName)
    if ($entry -notmatch '-NoExit' -or $entry -notmatch 'Start-Classroom-Setup.ps1') { throw 'Setup must leave the same PowerShell open.' }
    $success = $true
    Write-Host 'PASS classroom: single-window install, all four session keys, real GJC selectors, no secret persistence, mocked Guest, clear/reimport.'
}
finally {
    Remove-Module Session-Keys -Force -ErrorAction SilentlyContinue
    foreach ($name in @('Show-ClassroomStatus', 'Open-ClassroomGuest')) {
        Remove-Item -LiteralPath "Function:\$name" -Force -ErrorAction SilentlyContinue
    }
    foreach ($name in $managedNames) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    Set-Location -LiteralPath $originalLocation.Path
    if ($success) {
        $resolved = [IO.Path]::GetFullPath($fixture)
        $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
        if (-not $resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or
            [IO.Path]::GetFileName($resolved) -notmatch '^classroom-session-test-[a-f0-9]{32}$') {
            throw 'Unsafe fixture cleanup target.'
        }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    else { Write-Host "Fixture retained for diagnosis: $fixture (fake keys only)." }
}
