# 사용 통제 장비 한 번에 설치 — 윈도우 10 · 11 (관리자 권한 PowerShell 에서 실행).
#
#   $env:SRM_URL='https://<대시보드>'; $env:SRM_TOKEN='srmag_…'; iex ([Text.Encoding]::UTF8.GetString((New-Object Net.WebClient).DownloadData("$env:SRM_URL/access-agent/install.ps1")))
#
# 하는 일: ① 토큰·서버 확인 ② AdGuard Home 설치와 초기 설정 ③ 방화벽에서 DNS(53번) 열기
#          ④ 동기화 에이전트와 전용 node.exe 설치 ⑤ 한 번 맞춰 본 뒤 "컴퓨터 시작 시 실행" 작업으로 등록 ⑥ 절전 끄기
# 다시 실행해도 된다 — 이미 된 단계는 건너뛴다 (에이전트 파일만 새로 받아 갈아 끼운다).
# AdGuard Home 을 이미 직접 설정해 둔 PC 라면 $env:ADGUARD_USER · $env:ADGUARD_PASSWORD (포트가 다르면 $env:ADGUARD_URL) 를 함께 준다.
#
# 윈도우 PowerShell 5.1 에서도 돌도록 새 문법(?:, ?? 등)을 쓰지 않는다.
# iex 로 실행되므로 exit 를 쓰지 않는다 (쓰면 사용자의 PowerShell 창이 닫힌다) — 실패는 throw 로 알리고 맨 아래에서 받는다.

function Install-SrmAccessAgent {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue' # 진행 막대가 PowerShell 5.1 의 다운로드를 매우 느리게 만든다
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  } catch { }

  function Say([string]$message) {
    Write-Host ''
    Write-Host "==> $message" -ForegroundColor Cyan
  }

  # HTTP 상태 코드만 돌려준다 (오류 응답·리다이렉트도 숫자로, 연결 실패는 0)
  function Get-HttpStatus([string]$url, [hashtable]$headers) {
    try {
      $res = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -TimeoutSec 20 -MaximumRedirection 0
      return [int]$res.StatusCode
    } catch {
      if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
      return 0
    }
  }

  function Wait-Http([string]$url, [hashtable]$headers, [int]$seconds) {
    for ($i = 0; $i -lt $seconds; $i++) {
      if ((Get-HttpStatus $url $headers) -eq 200) { return $true }
      Start-Sleep -Seconds 1
    }
    return $false
  }

  # 윈도우 PowerShell 5.1 에는 $IsWindows 가 없다. SRM_INSTALL_TEST 는 다른 OS 에서 흐름만 점검할 때 쓴다.
  $onWindows = ($PSVersionTable.PSEdition -ne 'Core') -or $IsWindows
  if (-not $onWindows -and -not $env:SRM_INSTALL_TEST) {
    throw '윈도우용 설치 스크립트입니다. 리눅스 장비에서는 install.sh 를 써 주세요.'
  }
  if ($onWindows) {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $isAdmin = (New-Object Security.Principal.WindowsPrincipal $identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) { throw '관리자 권한 PowerShell 에서 실행해 주세요 (시작 버튼 우클릭 > 터미널(관리자) 또는 Windows PowerShell(관리자)).' }
  }

  $srmUrl = "$($env:SRM_URL)".TrimEnd('/')
  $srmToken = "$($env:SRM_TOKEN)"
  if (-not $srmUrl -or -not $srmToken) {
    throw 'SRM_URL 과 SRM_TOKEN 이 필요합니다. 대시보드 > 사용 통제 > 장비 > 장비 등록에 나오는 명령을 그대로 붙여 넣어 주세요.'
  }

  $dir = 'C:\srm-access-agent'
  if ($env:SRM_INSTALL_DIR) { $dir = $env:SRM_INSTALL_DIR }
  $aghDir = 'C:\AdGuardHome'
  $taskName = 'SRM Access Agent'

  # ── ① 토큰·서버 확인 — 틀렸으면 아무것도 건드리기 전에 멈춘다 ───────────────
  Say '서버 연결과 토큰 확인'
  $code = Get-HttpStatus "$srmUrl/api/access-agent/state" @{ Authorization = "Bearer $srmToken" }
  if ($code -eq 401) { throw '토큰이 맞지 않습니다. 대시보드에서 장비를 다시 등록해 새 명령을 받아 주세요.' }
  if ($code -eq 0) { throw "서버($srmUrl)에 연결하지 못했습니다. 이 PC 의 인터넷 연결과 주소를 확인해 주세요." }
  if ($code -ne 200) { throw "서버가 $code 로 응답했습니다. 대시보드에 사용 통제 기능이 배포돼 있는지 확인해 주세요." }

  # ── ② AdGuard Home ─────────────────────────────────────────────────────
  $aghUrl = 'http://127.0.0.1:3000'
  if ($env:ADGUARD_URL) { $aghUrl = "$($env:ADGUARD_URL)".TrimEnd('/') }
  $aghUser = "$($env:ADGUARD_USER)"
  $aghPass = "$($env:ADGUARD_PASSWORD)"
  $envFile = Join-Path $dir '.env'
  # 다시 실행하는 경우: 지난번에 적어 둔 계정을 쓴다
  if (-not $aghUser -and (Test-Path $envFile)) {
    foreach ($line in Get-Content $envFile) {
      if ($line -match '^ADGUARD_USER=(.*)$') { $aghUser = $Matches[1].Trim() }
      if ($line -match '^ADGUARD_PASSWORD=(.*)$') { $aghPass = $Matches[1].Trim() }
      if ($line -match '^ADGUARD_URL=(.*)$') { $aghUrl = $Matches[1].Trim() }
    }
  }

  if ($onWindows) {
    $aghExe = Join-Path $aghDir 'AdGuardHome.exe'
    if (-not (Test-Path $aghExe)) {
      Say 'AdGuard Home 설치 (무료 · 오픈소스)'
      $arch = 'amd64'
      if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { $arch = 'arm64' }
      $zip = Join-Path $env:TEMP 'AdGuardHome.zip'
      Invoke-WebRequest -Uri "https://static.adtidy.org/adguardhome/release/AdGuardHome_windows_$arch.zip" -OutFile $zip -UseBasicParsing
      # 압축 안의 폴더 이름이 AdGuardHome 이라 C:\ 에 풀면 C:\AdGuardHome 이 된다
      Expand-Archive -Path $zip -DestinationPath (Split-Path $aghDir -Parent) -Force
      Remove-Item $zip -Force
      & $aghExe -s install | Out-Null # 윈도우 서비스로 등록하고 시작한다
    }

    if (-not (Test-Path (Join-Path $aghDir 'AdGuardHome.yaml'))) {
      Say 'AdGuard Home 초기 설정'
      $wizard = 'http://127.0.0.1:3000'
      if (-not (Wait-Http "$wizard/control/install/get_addresses" @{} 60)) {
        throw 'AdGuard Home 이 켜지지 않았습니다. 서비스 목록에서 AdGuardHome 상태를 확인해 주세요.'
      }
      $checkBody = @{
        web           = @{ ip = '127.0.0.1'; port = 3000; autofix = $false }
        dns           = @{ ip = '0.0.0.0'; port = 53; autofix = $false }
        set_static_ip = $false
      } | ConvertTo-Json -Compress
      $check = Invoke-RestMethod -Uri "$wizard/control/install/check_config" -Method Post -ContentType 'application/json' -Body $checkBody
      if ($check.dns.status) {
        throw "53번 포트(DNS)를 쓸 수 없습니다: $($check.dns.status) — 이 포트를 쓰는 기능(인터넷 연결 공유, 다른 DNS 프로그램)을 끄고 다시 실행해 주세요."
      }

      $bytes = New-Object byte[] 16
      [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
      $aghUser = 'srm'
      $aghPass = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
      $aghUrl = $wizard
      # 관리 화면은 이 PC 에서만 열리게 한다 (DNS 는 와이파이 기기들이 물어볼 수 있게 전체)
      $configBody = @{
        web      = @{ ip = '127.0.0.1'; port = 3000 }
        dns      = @{ ip = '0.0.0.0'; port = 53 }
        username = $aghUser
        password = $aghPass
      } | ConvertTo-Json -Compress
      Invoke-RestMethod -Uri "$wizard/control/install/configure" -Method Post -ContentType 'application/json' -Body $configBody | Out-Null
    }
  }

  if (-not $aghUser -or -not $aghPass) {
    throw '이미 설정된 AdGuard Home 이 있습니다. 관리자 계정을 함께 넘겨 주세요: 명령 앞에 $env:ADGUARD_USER=''아이디''; $env:ADGUARD_PASSWORD=''비밀번호''; 를 붙입니다.'
  }
  $basic = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${aghUser}:${aghPass}"))
  if (-not (Wait-Http "$aghUrl/control/status" @{ Authorization = $basic } 60)) {
    throw "AdGuard Home($aghUrl)에 로그인하지 못했습니다. 계정과 주소를 확인해 주세요."
  }

  # ── ③ 방화벽: 와이파이 기기들이 이 PC 에 주소를 물어볼 수 있게 ────────────────
  if ($onWindows) {
    Say '방화벽에서 DNS(53번) 열기'
    foreach ($proto in 'UDP', 'TCP') {
      $ruleName = "SRM AdGuard Home DNS ($proto)"
      Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
      New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol $proto -LocalPort 53 -Action Allow -Profile Any | Out-Null
    }
  }

  # ── ④ 동기화 에이전트 ───────────────────────────────────────────────────
  Say '동기화 에이전트 설치'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  if ($onWindows) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    # 전용 node.exe 를 둔다 — PC 에 Node.js 를 따로 설치하지 않는다
    $node = Join-Path $dir 'node.exe'
    if (-not (Test-Path $node)) {
      $nodeArch = 'x64'
      if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { $nodeArch = 'arm64' }
      Invoke-WebRequest -Uri "https://nodejs.org/dist/latest-v22.x/win-$nodeArch/node.exe" -OutFile $node -UseBasicParsing
    }
  } else {
    $node = (Get-Command node).Source
  }
  $agentFile = Join-Path $dir 'agent.mjs'
  Invoke-WebRequest -Uri "$srmUrl/access-agent/agent.mjs" -OutFile "$agentFile.new" -UseBasicParsing
  Move-Item -Force "$agentFile.new" $agentFile

  $envText = @(
    "SRM_URL=$srmUrl"
    "SRM_TOKEN=$srmToken"
    "ADGUARD_URL=$aghUrl"
    "ADGUARD_USER=$aghUser"
    "ADGUARD_PASSWORD=$aghPass"
    "LOG_FILE=$(Join-Path $dir 'agent.log')"
  ) -join "`n"
  [IO.File]::WriteAllText($envFile, "$envText`n", (New-Object Text.UTF8Encoding $false))
  if ($onWindows) {
    # 토큰과 비밀번호가 들어 있으므로 관리자와 시스템만 읽게 한다 (SID 로 적어 언어와 무관)
    & icacls $envFile /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
  }

  # ── ⑤ 한 번 맞춰 보고, 컴퓨터가 켜질 때마다 돌게 등록 ─────────────────────────
  Say '서버 정책을 AdGuard Home 에 한 번 넣어 보기'
  & $node $agentFile --once
  if ($LASTEXITCODE -ne 0) { throw '첫 동기화에 실패했습니다. 위 메시지를 확인해 주세요.' }

  if ($onWindows) {
    Say '컴퓨터 시작 시 자동 실행 등록'
    $action = New-ScheduledTaskAction -Execute $node -Argument "`"$agentFile`"" -WorkingDirectory $dir
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
      -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName

    # ── ⑥ 절전에 들어가면 시설 전체 인터넷이 멈춘다 ──────────────────────────
    Say '전원 연결 중 절전·최대 절전 끄기'
    & powercfg /change standby-timeout-ac 0
    & powercfg /change hibernate-timeout-ac 0
  }

  $ip = ''
  if ($onWindows) {
    $ip = (Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | Select-Object -First 1).IPv4Address.IPAddress
  }
  if (-not $ip) { $ip = '확인 필요' }

  Write-Host ''
  Write-Host '설치가 끝났습니다. 대시보드의 장비 탭에 "연결됨"이 보이는지 확인해 주세요.' -ForegroundColor Green
  Write-Host ''
  Write-Host "  이 PC 주소: $ip"
  Write-Host ''
  Write-Host '  남은 일'
  Write-Host '   1) 공유기 관리자 화면 > DHCP 설정에서 이 PC 에 항상 같은 주소가 가게 예약합니다.'
  Write-Host "   2) 같은 화면에서 기본 DNS 를 $ip 로 바꿉니다. 보조 DNS 는 비우거나 같은 주소를 넣습니다."
  Write-Host '      (이 단계를 해야 차단이 시작됩니다. 그 전에는 어떤 기기도 영향을 받지 않습니다.)'
  Write-Host '   3) 대시보드 > 사용 통제 > 기기 탭에서 학생 기기를 배정합니다.'
  Write-Host ''
  Write-Host '  이 PC 가 꺼지거나 절전에 들어가면 시설 와이파이의 인터넷이 멈춥니다. 항상 켜 두세요.'
  Write-Host "  AdGuard Home 관리 화면: http://127.0.0.1:3000 (이 PC 에서만 열림, 계정은 $envFile)"
  Write-Host "  동작 기록: $(Join-Path $dir 'agent.log')"
}

try {
  Install-SrmAccessAgent
} catch {
  Write-Host ''
  Write-Host "[설치 중단] $($_.Exception.Message)" -ForegroundColor Red
}
