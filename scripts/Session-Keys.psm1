Set-StrictMode -Version 2.0

<#
현재 PowerShell 창에서만 API 키를 보관하는 교실용 실행 도우미입니다.

    Import-Module .\scripts\Session-Keys.psm1
    gjc
    pi

키는 SecureString으로 메모리에만 남습니다. 자식 프로그램을 실행하는 동안에만
프로세스 환경 변수로 전달되고, 프로그램이 끝나면 즉시 이전 값으로 복원됩니다.
PowerShell 창을 닫거나 Clear-ClassroomSessionKeys를 실행하면 메모리 캐시도 지워집니다.
#>

$script:DefaultUnstructuredApiUrl = "https://api.unstructuredapp.io/general/v0/general"
$script:ServiceDefinitions = [ordered]@{
    Upstage = @{ EnvironmentVariable = "UPSTAGE_API_KEY"; Label = "Upstage"; Optional = $false }
    Mindlogic = @{ EnvironmentVariable = "MINDLOGIC_API_KEY"; Label = "Mindlogic"; Optional = $false }
    Tavily = @{ EnvironmentVariable = "TAVILY_API_KEY"; Label = "Tavily"; Optional = $true }
    Unstructured = @{ EnvironmentVariable = "UNSTRUCTURED_API_KEY"; Label = "Unstructured"; Optional = $true }
}
$script:SessionKeys = @{}
$script:OptionalPrompted = @{ Tavily = $false; Unstructured = $false }

$script:PromptReader = {
    param([string]$Message)
    Read-Host -Prompt $Message -AsSecureString
}

$script:ExecutableResolver = {
    param([ValidateSet("gjc", "pi")][string]$Launcher)

    if ($Launcher -eq "gjc") {
        $command = Get-Command -Name "gjc.exe" -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($null -ne $command) { return $command.Source }

        $fallback = Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "gjc\gjc.exe"
        if (Test-Path -LiteralPath $fallback -PathType Leaf) { return $fallback }
        return $null
    }

    $command = Get-Command -Name "pi.cmd" -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $command) { return $command.Source }

    $fallback = Join-Path ([Environment]::GetFolderPath("ApplicationData")) "npm\pi.cmd"
    if (Test-Path -LiteralPath $fallback -PathType Leaf) { return $fallback }
    return $null
}

$script:ProcessRunner = {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
}

$script:PiAuthPathResolver = {
    $override = [Environment]::GetEnvironmentVariable("PI_CODING_AGENT_DIR", [EnvironmentVariableTarget]::Process)
    if (-not [string]::IsNullOrWhiteSpace($override)) { return Join-Path $override "auth.json" }
    Join-Path (Join-Path $HOME ".pi") "agent\auth.json"
}

$script:PiAuthMetadataReader = {
    param([string]$Path)
    Get-Content -LiteralPath $Path -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
}

$script:GjcAgentDirResolver = {
    $override = [Environment]::GetEnvironmentVariable("GJC_CODING_AGENT_DIR", [EnvironmentVariableTarget]::Process)
    if (-not [string]::IsNullOrWhiteSpace($override)) { return $override }
    Join-Path (Join-Path $HOME ".gjc") "agent"
}

$script:GjcAccountMetadataRunner = {
    param([string]$Executable, [string[]]$Arguments)
    $output = & $Executable @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) { throw "metadata command failed" }
    ($output -join [Environment]::NewLine) | ConvertFrom-Json -ErrorAction Stop
}

function Remove-ClassroomSessionKey {
    param([Parameter(Mandatory = $true)][string]$Service)

    if ($script:SessionKeys.ContainsKey($Service)) {
        $secret = $script:SessionKeys[$Service]
        $script:SessionKeys.Remove($Service)
        $secret.Dispose()
    }
}

function Set-ClassroomSessionKeyValue {
    param(
        [Parameter(Mandatory = $true)][string]$Service,
        [Parameter(Mandatory = $true)][Security.SecureString]$Secret
    )

    Remove-ClassroomSessionKey -Service $Service
    if ($Secret.Length -gt 0) {
        $script:SessionKeys[$Service] = $Secret
    }
    else {
        $Secret.Dispose()
    }
}

function Read-ClassroomSessionKey {
    param(
        [Parameter(Mandatory = $true)][string]$Service,
        [Parameter(Mandatory = $true)][bool]$Required
    )

    if ($script:SessionKeys.ContainsKey($Service)) { return $true }
    if (-not $Required -and $script:OptionalPrompted[$Service]) { return $true }

    $definition = $script:ServiceDefinitions[$Service]
    $message = if ($Required) {
        "{0} API 키를 입력하세요 (현재 PowerShell 창에서만 보관)" -f $definition.Label
    }
    else {
        "{0} API 키는 선택 사항입니다 (Enter로 건너뛰기)" -f $definition.Label
    }

    try {
        $secret = & $script:PromptReader $message
    }
    catch {
        Write-Warning "키 입력을 취소했습니다. 프로그램을 시작하지 않습니다."
        return $false
    }

    if ($null -eq $secret) {
        Write-Warning "키 입력을 완료하지 않았습니다. 프로그램을 시작하지 않습니다."
        return $false
    }

    if (-not $Required) { $script:OptionalPrompted[$Service] = $true }
    if ($secret.Length -eq 0) {
        $secret.Dispose()
        if ($Required) {
            Write-Warning "필수 API 키가 비어 있어 프로그램을 시작하지 않습니다."
            return $false
        }
        Write-Host ("{0} API 키 입력을 이번 PowerShell 창에서 건너뜁니다." -f $definition.Label)
        return $true
    }

    Set-ClassroomSessionKeyValue -Service $Service -Secret $secret
    Write-Host ("{0} API 키를 현재 PowerShell 창의 메모리에 설정했습니다." -f $definition.Label)
    return $true
}

function Assert-SafeLauncherArguments {
    param([string[]]$ArgumentList)

    foreach ($argument in $ArgumentList) {
        if ($argument -match "^(?i)(?:--?|/)(?:api[-_]?key|token|access[-_]?token|secret|password|authorization)(?:[=:].*)?$" -or
            $argument -match "^(?i)(?:UPSTAGE|MINDLOGIC|TAVILY|UNSTRUCTURED)_API_KEY=") {
            throw "API 키나 비밀값은 명령줄 인수로 전달할 수 없습니다. 보안 입력 프롬프트를 사용하세요."
        }
    }
}

function Resolve-UnstructuredApiUrl {
    param([Parameter(Mandatory = $true)][string]$Value)

    try { $uri = [Uri]$Value }
    catch { throw "Unstructured API 주소는 인증정보나 쿼리가 없는 공식 HTTPS Partition 주소여야 합니다." }

    if (-not $uri.IsAbsoluteUri -or $uri.Scheme -ne "https" -or -not $uri.IsDefaultPort -or
        $uri.UserInfo -or $uri.Query -or $uri.Fragment -or
        $uri.Host -notmatch "(?i)(?:^|\.)unstructured(?:app)?\.io$" -or
        $uri.AbsolutePath -notmatch "^/general/v0/general/?$") {
        throw "Unstructured API 주소는 인증정보나 쿼리가 없는 공식 HTTPS Partition 주소여야 합니다."
    }

    return $uri.AbsoluteUri
}

function Test-PiStoredUpstageApiKey {
    $path = & $script:PiAuthPathResolver
    if ([string]::IsNullOrWhiteSpace($path) -or -not (Test-Path -LiteralPath $path -PathType Leaf)) { return $false }

    try {
        $metadata = & $script:PiAuthMetadataReader $path
        $upstageProperty = $metadata.PSObject.Properties["upstage"]
        if ($null -eq $upstageProperty -or $null -eq $upstageProperty.Value) { return $false }
        $typeProperty = $upstageProperty.Value.PSObject.Properties["type"]
        return $null -ne $typeProperty -and $typeProperty.Value -eq "api_key"
    }
    catch {
        throw "Pi 저장 인증 설정을 안전하게 확인하지 못했습니다. auth.json을 직접 점검한 뒤 다시 시도하세요."
    }
}

function Get-GjcConfiguredEnvKeyNames {
    $agentDir = & $script:GjcAgentDirResolver
    if ([string]::IsNullOrWhiteSpace($agentDir)) { throw "GJC 에이전트 폴더를 안전하게 확인하지 못했습니다." }
    $path = Join-Path $agentDir ".env"
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return @() }

    $configured = New-Object System.Collections.ArrayList
    try {
        foreach ($line in Get-Content -LiteralPath $path -ErrorAction Stop) {
            if ($line -notmatch '(?i)^\s*(?:export\s+)?(UPSTAGE_API_KEY|MINDLOGIC_API_KEY|TAVILY_API_KEY|UNSTRUCTURED_API_KEY)\s*=\s*(.*)$') { continue }
            $name = $matches[1]
            $assignment = $matches[2].Trim()
            if (-not $assignment -or $assignment -eq '""' -or $assignment -eq "''" -or $assignment.StartsWith("#")) { continue }
            if (-not $configured.Contains($name)) { [void]$configured.Add($name) }
        }
    }
    catch {
        throw "GJC .env 설정을 안전하게 확인하지 못했습니다. 파일을 직접 점검한 뒤 다시 시도하세요."
    }
    return @($configured)
}

function Get-GjcConfiguredModelSecretFields {
    $agentDir = & $script:GjcAgentDirResolver
    if ([string]::IsNullOrWhiteSpace($agentDir)) { throw "GJC 에이전트 폴더를 안전하게 확인하지 못했습니다." }
    $path = Join-Path $agentDir "models.yml"
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return @() }

    $configured = New-Object System.Collections.ArrayList
    try {
        foreach ($line in Get-Content -LiteralPath $path -ErrorAction Stop) {
            if ($line.TrimStart().StartsWith("#")) { continue }
            if ($line -match '(?i)(?:^|[\s{,])["'']?apiKey["'']?\s*:\s*([^,}#]+)') {
                $assignment = $matches[1].Trim()
                if ($assignment -and $assignment -ne '""' -and $assignment -ne "''" -and -not $assignment.StartsWith("#")) {
                    if (-not $configured.Contains("apiKey")) { [void]$configured.Add("apiKey") }
                }
            }
            if ($line -match '(?i)(?:^|[\s{,])["'']?Authorization["'']?\s*:\s*([^,}#]+)') {
                $assignment = $matches[1].Trim()
                if ($assignment -and $assignment -ne '""' -and $assignment -ne "''" -and -not $assignment.StartsWith("#")) {
                    if (-not $configured.Contains("Authorization header")) { [void]$configured.Add("Authorization header") }
                }
            }
        }
    }
    catch {
        throw "GJC models.yml 설정을 안전하게 확인하지 못했습니다. 파일을 직접 점검한 뒤 다시 시도하세요."
    }
    return @($configured)
}

function Get-GjcExplicitProfileHints {
    param([string[]]$ArgumentList = @())

    $hints = New-Object System.Collections.ArrayList
    for ($index = 0; $index -lt $ArgumentList.Count; $index++) {
        $argument = $ArgumentList[$index]
        if ($argument -match '^--(?:provider|profile)=(.+)$') {
            [void]$hints.Add($matches[1].ToLowerInvariant())
        }
        elseif ($argument -match '^--(?:provider|profile)$' -and $index + 1 -lt $ArgumentList.Count) {
            [void]$hints.Add($ArgumentList[$index + 1].ToLowerInvariant())
            $index++
        }
    }
    return @($hints)
}

function Test-GjcStoredApiKeyConflict {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [string[]]$ArgumentList = @(),
        [Parameter(Mandatory = $true)][string]$UnstructuredApiUrl,
        [ValidateSet("generation", "tavily")][string]$Purpose = "generation"
    )

    $envNames = @(Get-GjcConfiguredEnvKeyNames)
    if ($envNames.Count -gt 0) {
        throw ("GJC 에이전트 .env에 세션 키보다 우선할 수 있는 API 키 설정({0})이 있습니다. 파일은 변경하지 않았습니다. 강사 안내에 따라 기존 설정을 정리하세요." -f ($envNames -join ", "))
    }
    $modelFields = @(Get-GjcConfiguredModelSecretFields)
    if ($modelFields.Count -gt 0) {
        throw ("GJC models.yml에 세션 키보다 우선할 수 있는 직접 인증 설정({0})이 있습니다. 파일은 변경하지 않았습니다. apiKeyEnv 템플릿만 사용하도록 강사 안내에 따라 정리하세요." -f ($modelFields -join ", "))
    }

    try {
        $metadata = Invoke-ClassroomChildProcess -Executable $Executable -ArgumentList @("accounts", "list", "--json") -UnstructuredApiUrl $UnstructuredApiUrl -Runner $script:GjcAccountMetadataRunner
    }
    catch {
        throw "GJC 저장 계정 메타데이터를 안전하게 확인하지 못했습니다. 계정은 변경하지 않았습니다. 강사에게 문의하세요."
    }

    if ($null -eq $metadata) { throw "GJC 저장 계정 메타데이터 형식을 확인할 수 없습니다. 계정은 변경하지 않았습니다." }
    $okProperty = $metadata.PSObject.Properties["ok"]
    $accountsProperty = $metadata.PSObject.Properties["accounts"]
    if ($null -eq $okProperty -or $okProperty.Value -ne $true -or $null -eq $accountsProperty -or
        $null -eq $accountsProperty.Value -or $accountsProperty.Value -is [string] -or
        $accountsProperty.Value -isnot [System.Collections.IEnumerable]) {
        throw "GJC 저장 계정 메타데이터 형식을 확인할 수 없습니다. 계정은 변경하지 않았습니다."
    }
    $profileHints = @(Get-GjcExplicitProfileHints -ArgumentList $ArgumentList)
    $mindlogicAliasSelected = @($profileHints | Where-Object { $_ -match "mindlogic" }).Count -gt 0
    foreach ($account in @($accountsProperty.Value)) {
        if ($null -eq $account) { throw "GJC 저장 계정 메타데이터 형식을 확인할 수 없습니다. 계정은 변경하지 않았습니다." }
        $providerProperty = $account.PSObject.Properties["provider"]
        $kindProperty = $account.PSObject.Properties["credentialKind"]
        $sourceProperty = $account.PSObject.Properties["source"]
        if ($null -eq $providerProperty -or $null -eq $kindProperty -or $null -eq $sourceProperty -or
            [string]::IsNullOrWhiteSpace([string]$providerProperty.Value) -or
            [string]::IsNullOrWhiteSpace([string]$kindProperty.Value)) {
            throw "GJC 저장 계정 메타데이터 형식을 확인할 수 없습니다. 계정은 변경하지 않았습니다."
        }
        $credentialKind = ([string]$kindProperty.Value).ToLowerInvariant()
        $credentialSource = ([string]$sourceProperty.Value).ToLowerInvariant()
        if (@("api_key", "oauth") -notcontains $credentialKind -or
            @("stored", "env", "config", "runtime") -notcontains $credentialSource) {
            throw "GJC 저장 계정 메타데이터 형식을 확인할 수 없습니다. 계정은 변경하지 않았습니다."
        }
        if ($credentialKind -ne "api_key" -or $credentialSource -ne "stored") { continue }
        $provider = ([string]$providerProperty.Value).ToLowerInvariant()
        if ($Purpose -eq "tavily") {
            if ($provider -eq "tavily") { return $true }
            continue
        }
        if ($provider -eq "upstage" -or $provider -eq "mindlogic-luna" -or ($mindlogicAliasSelected -and $provider -match "(?i)^mindlogic(?:[-_].*)?$")) {
            return $true
        }
    }
    return $false
}

function Test-ClassroomManagementInvocation {
    param(
        [Parameter(Mandatory = $true)][ValidateSet("gjc", "pi")][string]$Launcher,
        [string[]]$ArgumentList = @()
    )

    if ($ArgumentList.Count -eq 0) { return $false }
    $first = $ArgumentList[0].ToLowerInvariant()
    if ($Launcher -eq "pi") {
        return @("--help", "-h", "--version", "-v", "install", "list", "update", "remove") -contains $first
    }
    return @("--help", "-h", "--version", "-v", "config", "accounts") -contains $first
}

function ConvertTo-TemporaryPlainText {
    param([Parameter(Mandatory = $true)][Security.SecureString]$Secret)

    $pointer = [IntPtr]::Zero
    try {
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        if ($pointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        }
    }
}

function Invoke-ClassroomChildProcess {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [string[]]$ArgumentList = @(),
        [Parameter(Mandatory = $true)][string]$UnstructuredApiUrl,
        [switch]$IncludeSessionKeys,
        [string[]]$SessionServices = @("Upstage", "Mindlogic", "Tavily", "Unstructured"),
        [scriptblock]$Runner = $script:ProcessRunner
    )

    $managedNames = @($script:ServiceDefinitions.Values | ForEach-Object { $_.EnvironmentVariable }) + "UNSTRUCTURED_API_URL"
    $processVariables = [Environment]::GetEnvironmentVariables([EnvironmentVariableTarget]::Process)
    $previous = @{}

    foreach ($name in $managedNames) {
        $previous[$name] = @{
            Exists = $processVariables.Contains($name)
            Value = [Environment]::GetEnvironmentVariable($name, [EnvironmentVariableTarget]::Process)
        }
    }

    try {
        foreach ($definition in $script:ServiceDefinitions.Values) {
            [Environment]::SetEnvironmentVariable($definition.EnvironmentVariable, $null, [EnvironmentVariableTarget]::Process)
        }
        if ($IncludeSessionKeys) {
            foreach ($service in $SessionServices) {
                if (-not $script:SessionKeys.ContainsKey($service)) { continue }
                $name = $script:ServiceDefinitions[$service].EnvironmentVariable
                $plainText = $null
                try {
                    $plainText = ConvertTo-TemporaryPlainText -Secret $script:SessionKeys[$service]
                    [Environment]::SetEnvironmentVariable($name, $plainText, [EnvironmentVariableTarget]::Process)
                }
                finally {
                    $plainText = $null
                }
            }
        }
        [Environment]::SetEnvironmentVariable("UNSTRUCTURED_API_URL", $UnstructuredApiUrl, [EnvironmentVariableTarget]::Process)

        try {
            & $Runner $Executable $ArgumentList
        }
        catch {
            throw "프로그램을 시작하지 못했습니다. 설치 상태를 확인한 뒤 다시 시도하세요."
        }
    }
    finally {
        foreach ($name in $managedNames) {
            if ($previous[$name].Exists) {
                [Environment]::SetEnvironmentVariable($name, $previous[$name].Value, [EnvironmentVariableTarget]::Process)
            }
            else {
                [Environment]::SetEnvironmentVariable($name, $null, [EnvironmentVariableTarget]::Process)
            }
        }
    }
}

function Invoke-ClassroomLauncher {
    param(
        [Parameter(Mandatory = $true)][ValidateSet("gjc", "pi")][string]$Launcher,
        [string[]]$ArgumentList = @(),
        [string]$UnstructuredApiUrl = $script:DefaultUnstructuredApiUrl
    )

    Assert-SafeLauncherArguments -ArgumentList $ArgumentList
    $endpoint = Resolve-UnstructuredApiUrl -Value $UnstructuredApiUrl
    $executable = & $script:ExecutableResolver $Launcher
    if ([string]::IsNullOrWhiteSpace($executable)) {
        throw ("{0} 실행 파일을 찾지 못했습니다. 먼저 정상 설치를 확인하세요." -f $Launcher)
    }

    if (Test-ClassroomManagementInvocation -Launcher $Launcher -ArgumentList $ArgumentList) {
        Invoke-ClassroomChildProcess -Executable $executable -ArgumentList $ArgumentList -UnstructuredApiUrl $endpoint
        return
    }

    if ($Launcher -eq "pi" -and (Test-PiStoredUpstageApiKey)) {
        throw "Pi auth.json에 Upstage API 키가 저장되어 있어 현재 창의 세션 키보다 우선할 수 있습니다. 저장 인증은 삭제하지 않았습니다. 별도로 정리한 뒤 다시 실행하세요."
    }

    if ($Launcher -eq "gjc" -and (Test-GjcStoredApiKeyConflict -Executable $executable -ArgumentList $ArgumentList -UnstructuredApiUrl $endpoint)) {
        throw "GJC에 Upstage 또는 현재 Mindlogic 프로필의 API 키 계정이 저장되어 있어 세션 키보다 우선할 수 있습니다. 저장 계정은 변경하지 않았습니다. 강사 안내에 따라 기존 API 키 계정을 정리하세요. OAuth 계정은 사용할 수 있습니다."
    }

    $requiredServices = if ($Launcher -eq "gjc") { @("Upstage", "Mindlogic") } else { @("Upstage") }
    foreach ($service in $requiredServices) {
        if (-not (Read-ClassroomSessionKey -Service $service -Required $true)) { return }
    }
    foreach ($service in @("Tavily", "Unstructured")) {
        if (-not (Read-ClassroomSessionKey -Service $service -Required $false)) { return }
    }

    Invoke-ClassroomChildProcess -Executable $executable -ArgumentList $ArgumentList -UnstructuredApiUrl $endpoint -IncludeSessionKeys
}

function Set-ClassroomSessionKeys {
    [CmdletBinding()]
    param(
        [ValidateSet("Upstage", "Mindlogic", "Tavily", "Unstructured")]
        [string[]]$Service = @("Upstage", "Mindlogic", "Tavily", "Unstructured")
    )

    foreach ($name in $Service) {
        $definition = $script:ServiceDefinitions[$name]
        $message = if ($definition.Optional) {
            "{0} API 키를 변경합니다 (선택 사항, Enter로 지우기)" -f $definition.Label
        }
        else {
            "{0} API 키를 변경합니다 (현재 PowerShell 창에서만 보관)" -f $definition.Label
        }

        try { $secret = & $script:PromptReader $message }
        catch {
            Write-Warning "키 입력을 취소했습니다. 기존 설정은 변경하지 않습니다."
            continue
        }
        if ($null -eq $secret) {
            Write-Warning "키 입력을 완료하지 않아 기존 설정을 변경하지 않습니다."
            continue
        }

        if ($definition.Optional) { $script:OptionalPrompted[$name] = $true }
        Set-ClassroomSessionKeyValue -Service $name -Secret $secret
        if ($script:SessionKeys.ContainsKey($name)) {
            Write-Host ("{0} API 키를 현재 PowerShell 창의 메모리에서 변경했습니다." -f $definition.Label)
        }
        else {
            Write-Host ("{0} API 키를 현재 PowerShell 창의 메모리에서 지웠습니다." -f $definition.Label)
        }
    }
}

function Clear-ClassroomSessionKeys {
    [CmdletBinding()]
    param()

    foreach ($service in @($script:SessionKeys.Keys)) {
        Remove-ClassroomSessionKey -Service $service
    }
    $script:OptionalPrompted.Tavily = $false
    $script:OptionalPrompted.Unstructured = $false
    Write-Host "현재 PowerShell 창의 API 키 메모리 캐시를 모두 지웠습니다."
}

function Get-ClassroomSessionKeyStatus {
    [CmdletBinding()]
    param()

    foreach ($service in $script:ServiceDefinitions.Keys) {
        $definition = $script:ServiceDefinitions[$service]
        $status = if ($script:SessionKeys.ContainsKey($service)) {
            "설정됨"
        }
        elseif ($definition.Optional -and $script:OptionalPrompted[$service]) {
            "이번 창에서 건너뜀"
        }
        else {
            "미설정"
        }
        [PSCustomObject]@{
            Service = $definition.Label
            EnvironmentVariable = $definition.EnvironmentVariable
            Status = $status
        }
    }
}

function Test-ClassroomWebSearch {
    [CmdletBinding()]
    param(
        [string]$UnstructuredApiUrl = $script:DefaultUnstructuredApiUrl
    )

    $endpoint = Resolve-UnstructuredApiUrl -Value $UnstructuredApiUrl
    $executable = & $script:ExecutableResolver "gjc"
    if ([string]::IsNullOrWhiteSpace($executable)) {
        throw "gjc 실행 파일을 찾지 못했습니다. 먼저 정상 설치를 확인하세요."
    }
    if (Test-GjcStoredApiKeyConflict -Executable $executable -UnstructuredApiUrl $endpoint -Purpose "tavily") {
        throw "GJC에 Tavily API 키 계정이 저장되어 있어 현재 창의 세션 키보다 우선할 수 있습니다. 저장 계정은 변경하지 않았습니다. 강사 안내에 따라 기존 API 키 계정을 정리하세요."
    }
    if (-not (Read-ClassroomSessionKey -Service "Tavily" -Required $true)) { return }

    $arguments = @(
        "web-search",
        "태양광 에너지의 최신 공개 정보를 찾아주세요",
        "--provider", "tavily",
        "--limit", "3",
        "--compact"
    )
    Write-Host "Tavily 연결 확인을 시작합니다. 모델 추론은 사용하지 않습니다."
    Invoke-ClassroomChildProcess -Executable $executable -ArgumentList $arguments -UnstructuredApiUrl $endpoint -IncludeSessionKeys -SessionServices @("Tavily")
}

function gjc {
    [CmdletBinding(PositionalBinding = $false)]
    param(
        [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
        [string[]]$ArgumentList = @(),
        [string]$UnstructuredApiUrl = $script:DefaultUnstructuredApiUrl
    )

    Invoke-ClassroomLauncher -Launcher "gjc" -ArgumentList $ArgumentList -UnstructuredApiUrl $UnstructuredApiUrl
}

function pi {
    [CmdletBinding(PositionalBinding = $false)]
    param(
        [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
        [string[]]$ArgumentList = @(),
        [string]$UnstructuredApiUrl = $script:DefaultUnstructuredApiUrl
    )

    Invoke-ClassroomLauncher -Launcher "pi" -ArgumentList $ArgumentList -UnstructuredApiUrl $UnstructuredApiUrl
}

$ExecutionContext.SessionState.Module.OnRemove = {
    foreach ($secret in @($script:SessionKeys.Values)) {
        try { $secret.Dispose() } catch {}
    }
    $script:SessionKeys.Clear()
    $script:OptionalPrompted.Tavily = $false
    $script:OptionalPrompted.Unstructured = $false
}

Export-ModuleMember -Function gjc, pi, Set-ClassroomSessionKeys, Clear-ClassroomSessionKeys, Get-ClassroomSessionKeyStatus, Test-ClassroomWebSearch
