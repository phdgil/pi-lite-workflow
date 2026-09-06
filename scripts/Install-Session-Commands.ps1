[CmdletBinding()]
param(
    [ValidateNotNullOrEmpty()]
    [string]$DestinationDirectory = (Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "DSWU\SessionCommands"),

    [ValidateNotNullOrEmpty()]
    [string[]]$ProfilePath = @(
        (Join-Path ([Environment]::GetFolderPath("MyDocuments")) "WindowsPowerShell\profile.ps1"),
        (Join-Path ([Environment]::GetFolderPath("MyDocuments")) "PowerShell\profile.ps1")
    )
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$sourceModulePath = Join-Path $PSScriptRoot "Session-Keys.psm1"
if (-not (Test-Path -LiteralPath $sourceModulePath -PathType Leaf)) {
    throw "설치할 Session-Keys.psm1 파일을 설치 스크립트와 같은 폴더에서 찾지 못했습니다."
}

$resolvedDestinationDirectory = [IO.Path]::GetFullPath($DestinationDirectory)
New-Item -ItemType Directory -Path $resolvedDestinationDirectory -Force | Out-Null
$installedModulePath = Join-Path $resolvedDestinationDirectory "Session-Keys.psm1"
Copy-Item -LiteralPath $sourceModulePath -Destination $installedModulePath -Force

$escapedModulePath = $installedModulePath.Replace("'", "''")
$startMarker = "# >>> DSWU Session Commands >>>"
$endMarker = "# <<< DSWU Session Commands <<<"
$importBlock = @"
$startMarker
if (Test-Path -LiteralPath '$escapedModulePath') {
    Import-Module -Name '$escapedModulePath' -Force
}
$endMarker
"@
$blockPattern = "(?ms)^" + [Regex]::Escape($startMarker) + ".*?^" + [Regex]::Escape($endMarker) + "[\t ]*(?:\r?\n)?"
$utf8Bom = New-Object Text.UTF8Encoding($true)

foreach ($path in @($ProfilePath | Select-Object -Unique)) {
    if ([string]::IsNullOrWhiteSpace($path)) {
        throw "PowerShell 프로필 경로는 비어 있을 수 없습니다."
    }

    $resolvedProfilePath = [IO.Path]::GetFullPath($path)
    $profileDirectory = Split-Path -Parent $resolvedProfilePath
    if ([string]::IsNullOrWhiteSpace($profileDirectory)) {
        throw "PowerShell 프로필의 상위 폴더를 확인할 수 없습니다: $resolvedProfilePath"
    }
    New-Item -ItemType Directory -Path $profileDirectory -Force | Out-Null

    $existingContent = if (Test-Path -LiteralPath $resolvedProfilePath -PathType Leaf) {
        [IO.File]::ReadAllText($resolvedProfilePath)
    }
    else {
        ""
    }

    $existingBlock = [Regex]::Match($existingContent, $blockPattern)
    if ($existingBlock.Success) {
        $updatedContent = $existingContent.Substring(0, $existingBlock.Index) +
            $importBlock + [Environment]::NewLine +
            $existingContent.Substring($existingBlock.Index + $existingBlock.Length)
    }
    else {
        $separator = if ($existingContent.Length -eq 0 -or $existingContent.EndsWith("`n") -or $existingContent.EndsWith("`r")) {
            ""
        }
        else {
            [Environment]::NewLine
        }
        $updatedContent = $existingContent + $separator + $importBlock + [Environment]::NewLine
    }

    [IO.File]::WriteAllText($resolvedProfilePath, $updatedContent, $utf8Bom)
    Write-Host "PowerShell 프로필에 세션 명령 모듈을 등록했습니다: $resolvedProfilePath"
}

Import-Module -Name $installedModulePath -Force -Global
Write-Host "세션 명령 모듈을 설치했습니다: $installedModulePath"
Write-Host "현재 창과 새 PowerShell 창에서 gjc 또는 pi를 실행할 수 있습니다. API 키는 각 PowerShell 창에만 보관됩니다."
Write-Host "프로필 실행이 실행 정책 때문에 차단되면 필요한 PowerShell 창에서만 다음 명령을 사용할 수 있습니다:"
Write-Host "Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned"
Write-Host "MachinePolicy 또는 UserPolicy가 적용된 PC에서는 이 명령으로 우회할 수 없습니다. 강사나 관리자에게 허용 정책 또는 서명된 프로필 설정을 요청하세요."
