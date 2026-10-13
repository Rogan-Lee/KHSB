#!/bin/sh
# 사용 통제 장비 한 번에 설치 — 라즈베리파이 OS · 우분투 · 데비안 (systemd 가 있는 리눅스).
#
#   curl -fsSL https://<대시보드>/access-agent/install.sh | sudo SRM_URL=https://<대시보드> SRM_TOKEN=srmag_… sh
#
# 하는 일: ① 토큰·서버 확인 ② Node.js ③ AdGuard Home 설치와 초기 설정 ④ 동기화 에이전트 설치 ⑤ 한 번 맞춰 본 뒤 서비스 등록.
# 다시 실행해도 된다 — 이미 된 단계는 건너뛴다 (에이전트 파일만 새로 받아 갈아 끼운다).
# AdGuard Home 을 이미 직접 설정해 둔 장비라면 ADGUARD_USER · ADGUARD_PASSWORD (포트가 다르면 ADGUARD_URL) 를 함께 넘긴다.
set -eu

DIR=/opt/srm-access-agent
AGH_DIR=/opt/AdGuardHome
UNIT=/etc/systemd/system/srm-access-agent.service

say() { printf '\n==> %s\n' "$*"; }
die() {
  printf '\n[설치 중단] %s\n' "$*" >&2
  exit 1
}

# url 이 200 을 줄 때까지 기다린다 (최대 $2 초). $3 은 curl 추가 인자.
wait_http() {
  i=0
  while [ "$i" -lt "$2" ]; do
    # shellcheck disable=SC2086
    [ "$(curl -s -o /dev/null -w '%{http_code}' ${3:-} "$1" 2>/dev/null || true)" = 200 ] && return 0
    i=$((i + 1))
    sleep 1
  done
  return 1
}

[ "$(id -u)" = 0 ] || die "root 로 실행해 주세요 (명령 앞에 sudo)."
command -v systemctl >/dev/null 2>&1 || die "systemd 가 있는 리눅스(라즈베리파이 OS·우분투·데비안)에서만 설치할 수 있습니다."

SRM_URL="${SRM_URL:-}"
SRM_URL="${SRM_URL%/}"
SRM_TOKEN="${SRM_TOKEN:-}"
[ -n "$SRM_URL" ] && [ -n "$SRM_TOKEN" ] ||
  die "SRM_URL 과 SRM_TOKEN 이 필요합니다. 대시보드 > 사용 통제 > 장비 > 장비 등록에 나오는 명령을 그대로 붙여 넣어 주세요."

if ! command -v curl >/dev/null 2>&1; then
  command -v apt-get >/dev/null 2>&1 || die "curl 을 먼저 설치해 주세요."
  apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl ca-certificates
fi

# ── ① 토큰·서버 확인 — 틀렸으면 아무것도 건드리기 전에 멈춘다 ─────────────────
say "서버 연결과 토큰 확인"
code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $SRM_TOKEN" "$SRM_URL/api/access-agent/state" || true)
case "$code" in
  200) ;;
  401) die "토큰이 맞지 않습니다. 대시보드에서 장비를 다시 등록해 새 명령을 받아 주세요." ;;
  000) die "서버($SRM_URL)에 연결하지 못했습니다. 이 장비의 인터넷 연결과 주소를 확인해 주세요." ;;
  *) die "서버가 $code 로 응답했습니다. 대시보드에 사용 통제 기능이 배포돼 있는지 확인해 주세요." ;;
esac

# ── ② Node.js 18 이상 ─────────────────────────────────────────────────────
node_ok() { command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]; }
if ! node_ok; then
  say "Node.js 설치"
  command -v apt-get >/dev/null 2>&1 || die "Node.js 18 이상을 먼저 설치한 뒤 다시 실행해 주세요."
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs iproute2 ca-certificates tar
  if ! node_ok; then
    # 배포판의 Node.js 가 오래된 경우 (우분투 22.04 등)
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
  fi
  node_ok || die "Node.js 18 이상을 설치하지 못했습니다. 직접 설치한 뒤 다시 실행해 주세요."
fi
# 와이파이에 붙은 기기를 찾는 데 쓰는 ip 명령 (대부분 이미 있다)
if ! command -v ip >/dev/null 2>&1 && command -v apt-get >/dev/null 2>&1; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq iproute2 >/dev/null 2>&1 || true
fi

# ── ③ AdGuard Home ───────────────────────────────────────────────────────
ADGUARD_URL="${ADGUARD_URL:-http://127.0.0.1:3000}"
ADGUARD_USER="${ADGUARD_USER:-}"
ADGUARD_PASSWORD="${ADGUARD_PASSWORD:-}"
# 다시 실행하는 경우: 지난번에 적어 둔 계정을 쓴다
if [ -z "$ADGUARD_USER" ] && [ -f "$DIR/.env" ]; then
  ADGUARD_USER=$(sed -n 's/^ADGUARD_USER=//p' "$DIR/.env")
  ADGUARD_PASSWORD=$(sed -n 's/^ADGUARD_PASSWORD=//p' "$DIR/.env")
  ADGUARD_URL=$(sed -n 's/^ADGUARD_URL=//p' "$DIR/.env")
fi

if [ ! -x "$AGH_DIR/AdGuardHome" ]; then
  say "AdGuard Home 설치 (무료 · 오픈소스)"
  curl -fsSL https://raw.githubusercontent.com/AdguardTeam/AdGuardHome/master/scripts/install.sh | sh -s -- -v
fi

if [ ! -f "$AGH_DIR/AdGuardHome.yaml" ]; then
  say "AdGuard Home 초기 설정"
  WIZARD=http://127.0.0.1:3000
  wait_http "$WIZARD/control/install/get_addresses" 60 || die "AdGuard Home 이 켜지지 않았습니다. 'systemctl status AdGuardHome' 을 확인해 주세요."
  # 53번 포트(DNS)를 쓸 수 있는지 AdGuard Home 에 물어본다. 빈 문자열이면 사용 가능.
  check_dns() {
    curl -fsS -X POST "$WIZARD/control/install/check_config" -H 'Content-Type: application/json' \
      -d '{"web":{"ip":"0.0.0.0","port":3000,"autofix":false},"dns":{"ip":"0.0.0.0","port":53,"autofix":false},"set_static_ip":false}' |
      node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(String(JSON.parse(d).dns?.status??""))}catch{process.stdout.write("응답을 읽지 못함")}})'
  }
  dns_status=$(check_dns)
  if [ -n "$dns_status" ] && systemctl is-active --quiet systemd-resolved 2>/dev/null; then
    # 우분투는 systemd-resolved 가 53번에서 대기한다 — 그 기능만 끈다 (AdGuard Home 공식 안내와 같은 방법)
    say "53번 포트를 쓰고 있는 systemd-resolved 의 DNS 대기 끄기"
    mkdir -p /etc/systemd/resolved.conf.d
    printf '[Resolve]\nDNSStubListener=no\n' >/etc/systemd/resolved.conf.d/srm-adguardhome.conf
    # 이 장비 자신의 이름 풀이는 공유기가 알려 준 DNS 를 그대로 쓰게 한다
    if [ "$(readlink -f /etc/resolv.conf 2>/dev/null || true)" = /run/systemd/resolve/stub-resolv.conf ]; then
      ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf
    fi
    systemctl restart systemd-resolved
    sleep 1
    dns_status=$(check_dns)
  fi
  [ -z "$dns_status" ] || die "53번 포트(DNS)를 쓸 수 없습니다: $dns_status — 이 포트를 쓰는 프로그램(dnsmasq 등)을 끄고 다시 실행해 주세요."

  ADGUARD_URL=$WIZARD
  ADGUARD_USER=srm
  ADGUARD_PASSWORD=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
  curl -fsS -o /dev/null -X POST "$WIZARD/control/install/configure" -H 'Content-Type: application/json' \
    -d "{\"web\":{\"ip\":\"0.0.0.0\",\"port\":3000},\"dns\":{\"ip\":\"0.0.0.0\",\"port\":53},\"username\":\"$ADGUARD_USER\",\"password\":\"$ADGUARD_PASSWORD\"}" ||
    die "AdGuard Home 초기 설정에 실패했습니다."
fi

[ -n "$ADGUARD_USER" ] && [ -n "$ADGUARD_PASSWORD" ] ||
  die "이미 설정된 AdGuard Home 이 있습니다. 관리자 계정을 함께 넘겨 주세요: ADGUARD_USER=… ADGUARD_PASSWORD=… (명령의 sudo 뒤에 추가)"
wait_http "$ADGUARD_URL/control/status" 60 "-u $ADGUARD_USER:$ADGUARD_PASSWORD" ||
  die "AdGuard Home($ADGUARD_URL)에 로그인하지 못했습니다. 계정과 주소를 확인해 주세요."

# ── ④ 동기화 에이전트 ─────────────────────────────────────────────────────
say "동기화 에이전트 설치"
mkdir -p "$DIR"
curl -fsSL "$SRM_URL/access-agent/agent.mjs" -o "$DIR/agent.mjs.new" || die "에이전트 파일을 받지 못했습니다."
mv "$DIR/agent.mjs.new" "$DIR/agent.mjs"
(
  umask 077
  cat >"$DIR/.env" <<ENV
SRM_URL=$SRM_URL
SRM_TOKEN=$SRM_TOKEN
ADGUARD_URL=$ADGUARD_URL
ADGUARD_USER=$ADGUARD_USER
ADGUARD_PASSWORD=$ADGUARD_PASSWORD
ENV
)

# ── ⑤ 한 번 맞춰 보고 서비스로 등록 ────────────────────────────────────────
say "서버 정책을 AdGuard Home 에 한 번 넣어 보기"
(cd "$DIR" && node agent.mjs --once) || die "첫 동기화에 실패했습니다. 위 메시지를 확인해 주세요."

cat >"$UNIT" <<SERVICE
[Unit]
Description=Study Room Manager access-control agent
After=network-online.target AdGuardHome.service
Wants=network-online.target

[Service]
WorkingDirectory=$DIR
ExecStart=$(command -v node) $DIR/agent.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE
systemctl daemon-reload
systemctl enable srm-access-agent >/dev/null 2>&1
systemctl restart srm-access-agent

ip_addr=$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -1)
[ -n "$ip_addr" ] || ip_addr=$(hostname -I 2>/dev/null | awk '{print $1}')
cat <<DONE

설치가 끝났습니다. 대시보드의 장비 탭에 "연결됨"이 보이는지 확인해 주세요.

  이 장비 주소: ${ip_addr:-확인 필요}

  남은 일
   1) 공유기 관리자 화면 > DHCP 설정에서 이 장비에 항상 같은 주소가 가게 예약합니다.
   2) 같은 화면에서 기본 DNS 를 ${ip_addr:-이 장비 주소} 로 바꿉니다. 보조 DNS 는 비우거나 같은 주소를 넣습니다.
      (이 단계를 해야 차단이 시작됩니다. 그 전에는 어떤 기기도 영향을 받지 않습니다.)
   3) 대시보드 > 사용 통제 > 기기 탭에서 학생 기기를 배정합니다.

  AdGuard Home 관리 화면: http://${ip_addr:-이 장비 주소}:3000
  관리자 계정은 $DIR/.env 에 적혀 있습니다 (sudo cat $DIR/.env).
DONE
