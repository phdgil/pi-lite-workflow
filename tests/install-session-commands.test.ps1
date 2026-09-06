$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$script:Passed = 0
$script:Failed = 0

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Assert-Equal {
    param($Actual, $Expected, [string]$Message)
    if ($Actual -ne $Expected) { throw "$Message (actual=$Actual expected=$Expected)" }
}

function Invoke-TestCase {
    param([string]$Name, [scriptblock]$Body)
    try {
        & $Body
        $script:Passed++
        Write-Host "PASS $Name"
    }
    catch {
        $script:Failed++
        Write-Host "FAIL $Name - $($_.Exception.Message)" -ForegroundColor Red
    }
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$installerPath = Join-Path $repositoryRoot "scripts\Install-Session-Commands.ps1"
$sourceModulePath = Join-Path $repositoryRoot "scripts\Session-Keys.psm1"
$temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) ("install-session-commands-test-" + [Guid]::NewGuid().ToString("N"))
$destinationDirectory = Join-Path $temporaryDirectory "Local App Data\teacher's `$1 room\DSWU\SessionCommands"
$existingProfilePath = Join-Path $temporaryDirectory "Documents\WindowsPowerShell\profile.ps1"
$newProfilePath = Join-Path $temporaryDirectory "OneDrive - 학교\Documents\PowerShell\profile.ps1"
$originalProfileContent = "# 기존 한국어 프로필`r`n`$global:FixtureProfileValue = '유지됨'`r`n"

New-Item -ItemType Directory -Path (Split-Path -Parent $existingProfilePath) -Force | Out-Null
[IO.File]::WriteAllText($existingProfilePath, $originalProfileContent, (New-Object Text.UTF8Encoding($true)))

try {
    $firstOutput = @(& $installerPath -DestinationDirectory $destinationDirectory -ProfilePath @($existingProfilePath, $newProfilePath) 6>&1 | ForEach-Object { $_.ToString() })
    $installedModulePath = Join-Path $destinationDirectory "Session-Keys.psm1"

    Invoke-TestCase "UTF-8 BOM and exact installer interface" {
        $bytes = [IO.File]::ReadAllBytes($installerPath)
        Assert-True ($bytes.Length -gt 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) "Installer must use UTF-8 BOM."
        $parameters = (Get-Command $installerPath).Parameters.Keys
        Assert-True ($parameters -contains "DestinationDirectory") "DestinationDirectory parameter is missing."
        Assert-True ($parameters -contains "ProfilePath") "ProfilePath parameter is missing."
    }

    Invoke-TestCase "module is copied without modification" {
        Assert-True (Test-Path -LiteralPath $installedModulePath -PathType Leaf) "Installed module is missing."
        $sourceHash = (Get-FileHash -LiteralPath $sourceModulePath -Algorithm SHA256).Hash
        $installedHash = (Get-FileHash -LiteralPath $installedModulePath -Algorithm SHA256).Hash
        Assert-Equal $installedHash $sourceHash "Installed module differs from its sibling source."
    }

    Invoke-TestCase "installer imports commands into the current global session" {
        Assert-Equal (Get-Command gjc -ErrorAction Stop).CommandType "Function" "gjc is unavailable in the current session."
        Assert-Equal (Get-Command pi -ErrorAction Stop).CommandType "Function" "pi is unavailable in the current session."
        Assert-Equal (Get-Command Get-ClassroomSessionKeyStatus -ErrorAction Stop).CommandType "Function" "Status command is unavailable in the current session."
    }

    Invoke-TestCase "profiles preserve content and contain only import setup" {
        $existingContent = [IO.File]::ReadAllText($existingProfilePath)
        $newContent = [IO.File]::ReadAllText($newProfilePath)
        $escapedInstalledModulePath = $installedModulePath.Replace("'", "''")
        Assert-True ($existingContent.StartsWith($originalProfileContent)) "Existing profile content was not preserved."
        foreach ($content in @($existingContent, $newContent)) {
            Assert-Equal ([Regex]::Matches($content, [Regex]::Escape("# >>> DSWU Session Commands >>>")).Count) 1 "Start marker count is incorrect."
            Assert-Equal ([Regex]::Matches($content, [Regex]::Escape("# <<< DSWU Session Commands <<<")).Count) 1 "End marker count is incorrect."
            Assert-True ($content.Contains($escapedInstalledModulePath)) "Profile does not import the escaped fixture module path."
            Assert-True ($content -notmatch "UPSTAGE_API_KEY|MINDLOGIC_API_KEY|TAVILY_API_KEY|UNSTRUCTURED_API_KEY") "Profile contains API key handling."
        }
    }

    $beforeRepeat = @{}
    foreach ($profile in @($existingProfilePath, $newProfilePath)) {
        $beforeRepeat[$profile] = [IO.File]::ReadAllText($profile)
    }
    $secondOutput = @(& $installerPath -DestinationDirectory $destinationDirectory -ProfilePath @($existingProfilePath, $newProfilePath, $existingProfilePath) 6>&1 | ForEach-Object { $_.ToString() })

    Invoke-TestCase "repeat installation is idempotent" {
        foreach ($profile in @($existingProfilePath, $newProfilePath)) {
            Assert-Equal ([IO.File]::ReadAllText($profile)) $beforeRepeat[$profile] "Repeated install changed a profile."
        }
        Assert-Equal (@($secondOutput | Where-Object { $_ -match "프로필에 세션 명령 모듈을 등록했습니다" }).Count) 2 "Duplicate profile paths were not de-duplicated."
    }

    Invoke-TestCase "fixture profile makes gjc and pi available" {
        Remove-Module Session-Keys -Force -ErrorAction SilentlyContinue
        . $newProfilePath
        Assert-Equal (Get-Command gjc -ErrorAction Stop).CommandType "Function" "gjc was not imported as a function."
        Assert-Equal (Get-Command pi -ErrorAction Stop).CommandType "Function" "pi was not imported as a function."
        Remove-Module Session-Keys -Force -ErrorAction SilentlyContinue
    }

    Invoke-TestCase "policy guidance is session-only and accurate" {
        $output = ($firstOutput -join "`n")
        Assert-True ($output -match "Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned") "Session-only execution policy guidance is missing."
        Assert-True ($output -match "MachinePolicy.*UserPolicy.*우회할 수 없습니다") "Group Policy limitation guidance is missing."
        $source = Get-Content -LiteralPath $installerPath -Raw
        Assert-True ($source -notmatch "EnvironmentVariableTarget\]::(?:User|Machine)|SetEnvironmentVariable|Set-Item\s+Env:") "Installer mutates environment variables."
        Assert-True ($source -notmatch "Remove-Item.*(?:credential|auth|key)|cmdkey|CredentialManager") "Installer contains credential deletion logic."
    }
}
finally {
    Remove-Module Session-Keys -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $temporaryDirectory) {
        $resolvedTemporary = [IO.Path]::GetFullPath($temporaryDirectory)
        $resolvedRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
        if (-not $resolvedTemporary.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase) -or
            [IO.Path]::GetFileName($resolvedTemporary) -notmatch '^install-session-commands-test-[a-f0-9]{32}$') {
            throw 'Unsafe fixture cleanup target.'
        }
        Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
    }
}

Write-Host "RESULT passed=$script:Passed failed=$script:Failed"
if ($script:Failed -gt 0) { exit 1 }
