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

function Assert-Throws {
    param([scriptblock]$Action, [string]$Pattern, [string]$Message)
    try {
        & $Action
    }
    catch {
        if ($_.Exception.Message -notmatch $Pattern) {
            throw "$Message (unexpected error: $($_.Exception.Message))"
        }
        return $_.Exception.Message
    }
    throw "$Message (no error)"
}

function Assert-ThrowsExceptionType {
    param([scriptblock]$Action, [Type]$ExceptionType, [string]$Message)
    try {
        & $Action
    }
    catch {
        $exception = $_.Exception
        while ($null -ne $exception) {
            if ($ExceptionType.IsInstanceOfType($exception)) { return }
            $exception = $exception.InnerException
        }
        throw "$Message (unexpected exception type: $($_.Exception.GetType().FullName))"
    }
    throw "$Message (no error)"
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

$modulePath = Join-Path (Split-Path -Parent $PSScriptRoot) "scripts\Session-Keys.psm1"
$managedNames = @("UPSTAGE_API_KEY", "MINDLOGIC_API_KEY", "TAVILY_API_KEY", "UNSTRUCTURED_API_KEY", "UNSTRUCTURED_API_URL")
$originalEnvironment = @{}
$processEnvironment = [Environment]::GetEnvironmentVariables([EnvironmentVariableTarget]::Process)
foreach ($name in $managedNames) {
    $originalEnvironment[$name] = @{
        Exists = $processEnvironment.Contains($name)
        Value = [Environment]::GetEnvironmentVariable($name, [EnvironmentVariableTarget]::Process)
    }
}

$temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) ("session-keys-test-" + [Guid]::NewGuid().ToString("N"))
$authPath = Join-Path $temporaryDirectory "auth.json"
$gjcAgentPath = Join-Path $temporaryDirectory "gjc-agent"
New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
New-Item -ItemType Directory -Path $gjcAgentPath | Out-Null

try {
    [Environment]::SetEnvironmentVariable("UPSTAGE_API_KEY", "preexisting-process-value", [EnvironmentVariableTarget]::Process)
    foreach ($name in @("MINDLOGIC_API_KEY", "TAVILY_API_KEY", "UNSTRUCTURED_API_KEY", "UNSTRUCTURED_API_URL")) {
        [Environment]::SetEnvironmentVariable($name, $null, [EnvironmentVariableTarget]::Process)
    }

    Import-Module $modulePath -Force
    $module = Get-Module Session-Keys
    if ($null -eq $module) { throw "Module did not import." }

    & $module {
        param([string]$FixtureAuthPath, [string]$FixtureGjcAgentPath)
        $script:TestAuthPath = $FixtureAuthPath
        $script:TestGjcAgentPath = $FixtureGjcAgentPath
        $script:DefaultPiAuthPathResolver = $script:PiAuthPathResolver
        $script:DefaultGjcAgentDirResolver = $script:GjcAgentDirResolver
        $script:TestPromptQueue = New-Object System.Collections.Queue
        $script:TestPromptMessages = New-Object System.Collections.ArrayList
        $script:TestInvocations = New-Object System.Collections.ArrayList
        $script:TestGjcAccounts = [PSCustomObject]@{ ok = $true; accounts = @() }
        $script:PiAuthPathResolver = { $script:TestAuthPath }
        $script:GjcAgentDirResolver = { $script:TestGjcAgentPath }
        $script:GjcAccountMetadataRunner = { $script:TestGjcAccounts }
        $script:PromptReader = {
            param([string]$Message)
            [void]$script:TestPromptMessages.Add($Message)
            if ($script:TestPromptQueue.Count -eq 0) { throw "unexpected prompt" }
            $value = [string]$script:TestPromptQueue.Dequeue()
            if ($value -eq "__CANCEL__") { throw "synthetic cancellation" }
            if ($value.Length -eq 0) { return New-Object Security.SecureString }
            ConvertTo-SecureString -String $value -AsPlainText -Force
        }
        $script:ExecutableResolver = {
            param([string]$Launcher)
            if ($Launcher -eq "gjc") { return "C:\fixture\gjc.exe" }
            return "C:\fixture\pi.cmd"
        }
        $script:ProcessRunner = {
            param([string]$Executable, [string[]]$Arguments)
            [void]$script:TestInvocations.Add([PSCustomObject]@{
                Executable = $Executable
                Arguments = @($Arguments)
                Upstage = [Environment]::GetEnvironmentVariable("UPSTAGE_API_KEY", [EnvironmentVariableTarget]::Process)
                Mindlogic = [Environment]::GetEnvironmentVariable("MINDLOGIC_API_KEY", [EnvironmentVariableTarget]::Process)
                Tavily = [Environment]::GetEnvironmentVariable("TAVILY_API_KEY", [EnvironmentVariableTarget]::Process)
                Unstructured = [Environment]::GetEnvironmentVariable("UNSTRUCTURED_API_KEY", [EnvironmentVariableTarget]::Process)
                Endpoint = [Environment]::GetEnvironmentVariable("UNSTRUCTURED_API_URL", [EnvironmentVariableTarget]::Process)
            })
        }
    } $authPath $gjcAgentPath

    Invoke-TestCase "UTF-8 BOM and exact public interface" {
        $bytes = [IO.File]::ReadAllBytes($modulePath)
        Assert-True ($bytes.Length -gt 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) "Module must use UTF-8 BOM."
        $actual = @(Get-Command -Module Session-Keys | Select-Object -ExpandProperty Name | Sort-Object)
        $expected = @("Clear-ClassroomSessionKeys", "Get-ClassroomSessionKeyStatus", "gjc", "pi", "Set-ClassroomSessionKeys", "Test-ClassroomWebSearch") | Sort-Object
        Assert-Equal ($actual -join ",") ($expected -join ",") "Unexpected exported functions."
        $setParameters = (Get-Command Set-ClassroomSessionKeys).Parameters.Keys
        Assert-True ($setParameters -contains "Service") "Set function must expose Service."
        Assert-True (-not ($setParameters -match "Key|Secret|Value")) "Set function must not accept a raw key parameter."
    }

    Invoke-TestCase "management commands bypass prompts and managed keys" {
        pi --help
        pi --version
        pi install fixture
        pi list
        pi update
        pi remove fixture
        gjc --help
        gjc --version
        gjc config list
        gjc accounts list
        $state = & $module { [PSCustomObject]@{ Prompts = $script:TestPromptMessages.Count; Calls = @($script:TestInvocations) } }
        Assert-Equal $state.Prompts 0 "Management commands must not prompt."
        Assert-Equal $state.Calls.Count 10 "Every supported management command must run."
        foreach ($call in $state.Calls) {
            Assert-Equal $call.Upstage $null "Management child inherited Upstage key."
            Assert-Equal $call.Mindlogic $null "Management child inherited Mindlogic key."
            Assert-Equal $call.Tavily $null "Management child inherited Tavily key."
            Assert-Equal $call.Unstructured $null "Management child inherited Unstructured key."
            Assert-Equal $call.Endpoint "https://api.unstructuredapp.io/general/v0/general" "Managed endpoint missing."
        }
        Assert-Equal ([Environment]::GetEnvironmentVariable("UPSTAGE_API_KEY", [EnvironmentVariableTarget]::Process)) "preexisting-process-value" "Prior process key was not restored."
    }

    Invoke-TestCase "official agent-directory overrides select metadata paths" {
        $piAgent = Join-Path $temporaryDirectory "pi-agent"
        $gjcAgent = Join-Path $temporaryDirectory "gjc-override"
        [Environment]::SetEnvironmentVariable("PI_CODING_AGENT_DIR", $piAgent, [EnvironmentVariableTarget]::Process)
        [Environment]::SetEnvironmentVariable("GJC_CODING_AGENT_DIR", $gjcAgent, [EnvironmentVariableTarget]::Process)
        try {
            $paths = & $module {
                [PSCustomObject]@{
                    Pi = & $script:DefaultPiAuthPathResolver
                    Gjc = & $script:DefaultGjcAgentDirResolver
                }
            }
            Assert-Equal $paths.Pi (Join-Path $piAgent "auth.json") "PI_CODING_AGENT_DIR was ignored."
            Assert-Equal $paths.Gjc $gjcAgent "GJC_CODING_AGENT_DIR was ignored."
        }
        finally {
            [Environment]::SetEnvironmentVariable("PI_CODING_AGENT_DIR", $null, [EnvironmentVariableTarget]::Process)
            [Environment]::SetEnvironmentVariable("GJC_CODING_AGENT_DIR", $null, [EnvironmentVariableTarget]::Process)
        }
    }

    Invoke-TestCase "ordinary pi prompts once and never imports process keys" {
        $before = & $module { $script:TestInvocations.Count }
        & $module {
            $script:TestPromptQueue.Enqueue("session-upstage")
            $script:TestPromptQueue.Enqueue("")
            $script:TestPromptQueue.Enqueue("")
        }
        pi chat
        pi chat
        $state = & $module { [PSCustomObject]@{ Prompts = $script:TestPromptMessages.Count; Calls = @($script:TestInvocations) } }
        Assert-Equal $state.Prompts 3 "Pi should prompt for Upstage and both optional keys once."
        $first = $state.Calls[$before]
        Assert-Equal $first.Upstage "session-upstage" "Pi did not inject the session Upstage key."
        Assert-True ($first.Upstage -ne "preexisting-process-value") "Pi imported the prior process key."
        Assert-Equal $first.Tavily $null "Skipped Tavily key must clear inherited values."
        Assert-Equal $first.Unstructured $null "Skipped Unstructured key must clear inherited values."
        Assert-Equal $state.Calls.Count ($before + 2) "Two ordinary Pi launches were expected."
    }

    Invoke-TestCase "ordinary gjc additionally requires Mindlogic" {
        & $module { $script:TestPromptQueue.Enqueue("session-mindlogic") }
        gjc run
        $state = & $module { [PSCustomObject]@{ Prompts = $script:TestPromptMessages.Count; Last = $script:TestInvocations[$script:TestInvocations.Count - 1] } }
        Assert-Equal $state.Prompts 4 "GJC should prompt only for missing Mindlogic."
        Assert-Equal $state.Last.Upstage "session-upstage" "GJC Upstage session key missing."
        Assert-Equal $state.Last.Mindlogic "session-mindlogic" "GJC Mindlogic session key missing."
    }

    Invoke-TestCase "selected secure update changes one optional key" {
        & $module { $script:TestPromptQueue.Enqueue("session-tavily") }
        Set-ClassroomSessionKeys -Service Tavily
        pi chat
        $state = & $module { [PSCustomObject]@{ Prompts = $script:TestPromptMessages.Count; Last = $script:TestInvocations[$script:TestInvocations.Count - 1] } }
        Assert-Equal $state.Prompts 5 "Selected update should use one secure prompt."
        Assert-Equal $state.Last.Tavily "session-tavily" "Updated Tavily key was not injected."
        Assert-Equal $state.Last.Unstructured $null "Unstructured should remain skipped."
    }

    Invoke-TestCase "native generation flags pass through unchanged" {
        pi --provider upstage --model solar-pro4 --thinking max
        $last = & $module { $script:TestInvocations[$script:TestInvocations.Count - 1] }
        Assert-Equal ($last.Arguments -join "|") "--provider|upstage|--model|solar-pro4|--thinking|max" "Native flags changed."
        Assert-Equal $last.Upstage "session-upstage" "Native-flag launch missed session key."
    }

    Invoke-TestCase "management commands stay scrubbed after cache population" {
        pi list
        gjc accounts
        $calls = & $module { @($script:TestInvocations | Select-Object -Last 2) }
        foreach ($call in $calls) {
            Assert-Equal $call.Upstage $null "Management child received cached Upstage key."
            Assert-Equal $call.Mindlogic $null "Management child received cached Mindlogic key."
            Assert-Equal $call.Tavily $null "Management child received cached Tavily key."
            Assert-Equal $call.Unstructured $null "Management child received cached Unstructured key."
        }
    }

    Invoke-TestCase "web-search helper injects only Tavily into a fixed non-model command" {
        Test-ClassroomWebSearch
        $last = & $module { $script:TestInvocations[$script:TestInvocations.Count - 1] }
        Assert-Equal ($last.Arguments -join "|") "web-search|태양광 에너지의 최신 공개 정보를 찾아주세요|--provider|tavily|--limit|3|--compact" "Web-search command changed."
        Assert-Equal $last.Upstage $null "Web-search helper received Upstage key."
        Assert-Equal $last.Mindlogic $null "Web-search helper received Mindlogic key."
        Assert-Equal $last.Tavily "session-tavily" "Web-search helper missed Tavily key."
        Assert-Equal $last.Unstructured $null "Web-search helper received Unstructured key."
    }

    Invoke-TestCase "status exposes state but no secret values" {
        $status = @(Get-ClassroomSessionKeyStatus)
        Assert-Equal $status.Count 4 "Status should report four services."
        $serialized = $status | ConvertTo-Json -Compress
        foreach ($secret in @("session-upstage", "session-mindlogic", "session-tavily", "preexisting-process-value")) {
            Assert-True ($serialized -notmatch [Regex]::Escape($secret)) "Status exposed a secret."
        }
        Assert-Equal (($status | Where-Object Service -eq "Upstage").Status) "설정됨" "Upstage status incorrect."
        Assert-Equal (($status | Where-Object Service -eq "Unstructured").Status) "이번 창에서 건너뜀" "Optional skip status incorrect."
    }

    Invoke-TestCase "secret command-line arguments are rejected before launch" {
        $before = & $module { $script:TestInvocations.Count }
        $message = Assert-Throws { pi '--api-key=synthetic-command-secret' } "명령줄 인수" "Secret argument was not rejected."
        Assert-True ($message -notmatch "synthetic-command-secret") "Rejected argument leaked its value."
        Assert-Equal (& $module { $script:TestInvocations.Count }) $before "Rejected argument launched a child."
    }

    Invoke-TestCase "pi stored Upstage auth metadata blocks generation only" {
        [IO.File]::WriteAllText($authPath, '{"upstage":{"type":"api_key","key":"stored-fixture-secret"}}', (New-Object Text.UTF8Encoding($false)))
        $before = & $module { $script:TestInvocations.Count }
        $message = Assert-Throws { pi chat } "auth\.json.*우선" "Stored Pi auth did not block ordinary launch."
        Assert-True ($message -notmatch "stored-fixture-secret") "Stored auth value leaked."
        Assert-Equal (& $module { $script:TestInvocations.Count }) $before "Blocked Pi launch ran a child."
        pi list
        Assert-Equal (& $module { $script:TestInvocations.Count }) ($before + 1) "Pi management command should remain available."
        $saved = Get-Content -LiteralPath $authPath -Raw
        Assert-True ($saved -match "stored-fixture-secret") "Preflight altered stored auth."
        Remove-Item -LiteralPath $authPath -Force
    }

    Invoke-TestCase "GJC blocks conflicting env names and stored API-key metadata but allows OAuth" {
        $envPath = Join-Path $gjcAgentPath ".env"
        [IO.File]::WriteAllText($envPath, "UPSTAGE_API_KEY=stored-env-secret`nTAVILY_API_KEY=`n", (New-Object Text.UTF8Encoding($false)))
        $before = & $module { $script:TestInvocations.Count }
        $message = Assert-Throws { gjc run } "UPSTAGE_API_KEY.*파일은 변경하지 않았습니다" "GJC .env conflict did not block."
        Assert-True ($message -notmatch "stored-env-secret") "GJC .env value leaked."
        Assert-Equal (& $module { $script:TestInvocations.Count }) $before "GJC .env conflict launched a child."
        Assert-True ((Get-Content -LiteralPath $envPath -Raw) -match "stored-env-secret") "GJC .env was altered."
        Remove-Item -LiteralPath $envPath -Force

        & $module { $script:TestGjcAccounts = [PSCustomObject]@{ ok = $true; accounts = @([PSCustomObject]@{ provider = "upstage"; source = "stored"; credentialKind = "api_key" }) } }
        $message = Assert-Throws { gjc run } "API 키.*저장.*우선" "Stored GJC API key did not block."
        Assert-True ($message -notmatch "fixture-secret") "GJC account output leaked a value."

        & $module { $script:TestGjcAccounts = [PSCustomObject]@{ ok = $true; accounts = @([PSCustomObject]@{ provider = "upstage"; source = "stored"; credentialKind = "oauth" }) } }
        gjc run
        Assert-Equal (& $module { $script:TestInvocations.Count }) ($before + 1) "OAuth account should not block GJC."

        & $module { $script:TestGjcAccounts = [PSCustomObject]@{ ok = $true; accounts = @([PSCustomObject]@{ provider = "mindlogic-classroom"; source = "stored"; credentialKind = "api_key" }) } }
        gjc run
        Assert-Throws { gjc --profile mindlogic-classroom run } "Mindlogic.*API 키.*저장" "Selected Mindlogic alias did not block." | Out-Null
        Assert-Equal (& $module { $script:TestInvocations.Count }) ($before + 2) "Unselected Mindlogic alias should be allowed and selected alias blocked."
        & $module { $script:TestGjcAccounts = [PSCustomObject]@{ ok = $true; accounts = @() } }
    }

    Invoke-TestCase "GJC models template allows apiKeyEnv but blocks literal keys and auth headers" {
        $modelsPath = Join-Path $gjcAgentPath "models.yml"
        [IO.File]::WriteAllText($modelsPath, "providers:`n  upstage:`n    apiKeyEnv: UPSTAGE_API_KEY`n", (New-Object Text.UTF8Encoding($false)))
        $before = & $module { $script:TestInvocations.Count }
        gjc run
        Assert-Equal (& $module { $script:TestInvocations.Count }) ($before + 1) "apiKeyEnv-only template was blocked."

        [IO.File]::WriteAllText($modelsPath, "providers:`n  upstage:`n    apiKey: literal-model-secret`n", (New-Object Text.UTF8Encoding($false)))
        $message = Assert-Throws { gjc run } "models\.yml.*apiKey.*파일은 변경하지 않았습니다" "Literal model apiKey did not block."
        Assert-True ($message -notmatch "literal-model-secret") "Literal model key leaked."
        Assert-True ((Get-Content -LiteralPath $modelsPath -Raw) -match "literal-model-secret") "models.yml was altered."

        [IO.File]::WriteAllText($modelsPath, "providers:`n  upstage:`n    headers:`n      Authorization: Bearer literal-header-secret`n", (New-Object Text.UTF8Encoding($false)))
        $message = Assert-Throws { gjc run } "models\.yml.*Authorization header" "Literal authorization header did not block."
        Assert-True ($message -notmatch "literal-header-secret") "Literal authorization header leaked."

        [IO.File]::WriteAllText($modelsPath, 'providers: { upstage: { "apiKey": "inline-model-secret" } }', (New-Object Text.UTF8Encoding($false)))
        $message = Assert-Throws { gjc run } "models\.yml.*apiKey" "Inline literal model apiKey did not block."
        Assert-True ($message -notmatch "inline-model-secret") "Inline literal model key leaked."
        Remove-Item -LiteralPath $modelsPath -Force
    }

    Invoke-TestCase "web-search helper blocks stored Tavily API keys but allows OAuth" {
        $before = & $module { $script:TestInvocations.Count }
        & $module { $script:TestGjcAccounts = [PSCustomObject]@{ ok = $true; accounts = @([PSCustomObject]@{ provider = "tavily"; source = "stored"; credentialKind = "api_key" }) } }
        Assert-Throws { Test-ClassroomWebSearch } "Tavily API 키.*저장.*우선" "Stored Tavily API key did not block helper." | Out-Null
        Assert-Equal (& $module { $script:TestInvocations.Count }) $before "Blocked Tavily helper launched a child."
        & $module { $script:TestGjcAccounts = [PSCustomObject]@{ ok = $true; accounts = @([PSCustomObject]@{ provider = "tavily"; source = "stored"; credentialKind = "oauth" }) } }
        Test-ClassroomWebSearch
        Assert-Equal (& $module { $script:TestInvocations.Count }) ($before + 1) "Tavily OAuth metadata should not block session env search."
        & $module { $script:TestGjcAccounts = [PSCustomObject]@{ ok = $true; accounts = @() } }
    }

    Invoke-TestCase "GJC synthetic environment config and runtime rows are not persistent conflicts" {
        foreach ($source in @("env", "config", "runtime")) {
            & $module {
                param([string]$Source)
                $script:TestGjcAccounts = [PSCustomObject]@{
                    ok = $true
                    accounts = @([PSCustomObject]@{ provider = "upstage"; source = $Source; credentialKind = "api_key" })
                }
            } $source
            gjc run
        }
        & $module {
            $script:TestGjcAccounts = [PSCustomObject]@{
                ok = $true
                accounts = @([PSCustomObject]@{ provider = "upstage"; source = "unknown"; credentialKind = "api_key" })
            }
        }
        Assert-Throws { gjc run } "메타데이터 형식.*변경하지 않았습니다" "Unknown credential source failed open." | Out-Null
        & $module { $script:TestGjcAccounts = [PSCustomObject]@{ ok = $true; accounts = @() } }
    }

    Invoke-TestCase "GJC account metadata fails closed on unknown schemas" {
        $before = & $module { $script:TestInvocations.Count }
        & $module { $script:TestGjcAccounts = [PSCustomObject]@{ ok = $true } }
        Assert-Throws { gjc run } "메타데이터 형식.*변경하지 않았습니다" "Missing accounts array failed open." | Out-Null
        & $module { $script:TestGjcAccounts = [PSCustomObject]@{ ok = $true; accounts = @([PSCustomObject]@{ provider = "upstage" }) } }
        Assert-Throws { gjc run } "메타데이터 형식.*변경하지 않았습니다" "Malformed account row failed open." | Out-Null
        & $module { $script:TestGjcAccounts = [PSCustomObject]@{ ok = $true; accounts = @([PSCustomObject]@{ provider = "upstage"; credentialKind = "future_secret" }) } }
        Assert-Throws { gjc run } "메타데이터 형식.*변경하지 않았습니다" "Unknown credential kind failed open." | Out-Null
        Assert-Equal (& $module { $script:TestInvocations.Count }) $before "Malformed metadata launched a child."
        & $module { $script:TestGjcAccounts = [PSCustomObject]@{ ok = $true; accounts = @() } }
    }

    Invoke-TestCase "runner failures are sanitized and environment is restored" {
        & $module {
            $script:ProcessRunner = { throw "raw runner secret session-upstage" }
        }
        $message = Assert-Throws { pi chat } "프로그램을 시작하지 못했습니다" "Runner error was not sanitized."
        Assert-True ($message -notmatch "session-upstage|raw runner") "Raw runner error leaked."
        Assert-Equal ([Environment]::GetEnvironmentVariable("UPSTAGE_API_KEY", [EnvironmentVariableTarget]::Process)) "preexisting-process-value" "Runner failure did not restore prior environment."
        & $module {
            $script:ProcessRunner = {
                param([string]$Executable, [string[]]$Arguments)
                [void]$script:TestInvocations.Add([PSCustomObject]@{ Executable = $Executable; Arguments = @($Arguments) })
            }
        }
    }

    Invoke-TestCase "clear disposes cache and cancellation does not launch" {
        $secureReference = & $module { $script:SessionKeys["Upstage"] }
        Clear-ClassroomSessionKeys
        $state = & $module { [PSCustomObject]@{ Keys = $script:SessionKeys.Count; TavilyPrompted = $script:OptionalPrompted.Tavily; Calls = $script:TestInvocations.Count } }
        Assert-Equal $state.Keys 0 "Clear did not empty key cache."
        Assert-Equal $state.TavilyPrompted $false "Clear did not reset optional prompt state."
        Assert-ThrowsExceptionType {
            $pointer = [IntPtr]::Zero
            try { $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureReference) }
            finally { if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) } }
        } ([ObjectDisposedException]) "Clear did not dispose SecureString values."
        & $module { $script:TestPromptQueue.Enqueue("__CANCEL__") }
        pi chat
        Assert-Equal (& $module { $script:TestInvocations.Count }) $state.Calls "Cancelled prompt launched a child."
        Assert-Equal ([Environment]::GetEnvironmentVariable("UPSTAGE_API_KEY", [EnvironmentVariableTarget]::Process)) "preexisting-process-value" "Cancellation changed prior environment."
    }

    Invoke-TestCase "endpoint validation and source forbid persistence paths" {
        Assert-Throws { pi -ArgumentList @("--help") -UnstructuredApiUrl "http://example.com/api" } "공식 HTTPS Partition" "Invalid endpoint was accepted." | Out-Null
        $source = Get-Content -LiteralPath $modulePath -Raw
        Assert-True ($source -notmatch "EnvironmentVariableTarget\]::(?:User|Machine)") "Module accesses persistent environment scopes."
        Assert-True ($source -notmatch "(?m)^\s*(?:Export-Clixml|Set-Content|Add-Content|Out-File)\b") "Module contains a persistence write."
        Assert-True ($source -notmatch "PSObject\.Properties\[`"key`"\]") "Pi preflight accesses a stored key value."
        Assert-True ($source -notmatch "\.db\b|sqlite") "Module guesses a GJC database."
    }
}
finally {
    if (Get-Module Session-Keys) {
        try { Clear-ClassroomSessionKeys | Out-Null } catch {}
        Remove-Module Session-Keys -Force -ErrorAction SilentlyContinue
    }
    foreach ($name in $managedNames) {
        if ($originalEnvironment[$name].Exists) {
            [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name].Value, [EnvironmentVariableTarget]::Process)
        }
        else {
            [Environment]::SetEnvironmentVariable($name, $null, [EnvironmentVariableTarget]::Process)
        }
    }
    if (Test-Path -LiteralPath $temporaryDirectory) {
        $resolvedTemporaryDirectory = [IO.Path]::GetFullPath($temporaryDirectory).TrimEnd("\")
        $resolvedTemporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd("\")
        $fixtureName = [IO.Path]::GetFileName($resolvedTemporaryDirectory)
        $fixtureParent = [IO.Path]::GetDirectoryName($resolvedTemporaryDirectory).TrimEnd("\")
        if ($fixtureParent -ne $resolvedTemporaryRoot -or $fixtureName -notmatch '^session-keys-test-[0-9a-f]{32}$') {
            throw "Refusing recursive cleanup outside the exact session-key fixture root."
        }
        Remove-Item -LiteralPath $resolvedTemporaryDirectory -Recurse -Force
    }
}

Write-Host "RESULT passed=$script:Passed failed=$script:Failed"
if ($script:Failed -gt 0) { exit 1 }
