// ══ 강한선배 GNB 셸 — <body> 맨 앞에서 동기 로드 (bx-data.js 다음) ══
// 스크립트 태그 자리에 GNB·모바일 드로어를 즉시 그려 깜빡임이 없다.
// 페이지는 <body data-page="results" data-gnb="dark|light"> 로 현재 메뉴·히어로 톤을 알린다.
// 방문 통계: GA4(privacy.html 제6·10조). 모든 페이지가 이 셸을 거치므로 여기서 한 번만 붙인다.
// 방문자가 아래 안내 창에서 동의한 뒤에만 싣는다 — 동의 전에는 gtag 스크립트도 _ga 쿠키도 없고, 그 사이 gtag() 호출(버튼 클릭 등)은 쌓지 않고 버린다.
// 선택은 localStorage khsbGa('1' 동의 · '0' 거부). 저장이 막힌 브라우저는 이 페이지에서만 기억한다.
// 푸터 '방문 통계 설정'([data-ga-settings])으로 다시 열어 바꾼다. 거부·철회하면 _ga 쿠키를 지우고 싣지 않는다.
// 실제로 싣는 건 운영 도메인에서만 — 로컬·Vercel 미리보기 방문이 통계에 섞이지 않게. 헤드리스 브라우저(점검용 자동 방문·봇)도 뺀다.
window.gtag = function () {};
if (SITE.ga) (() => {
  const KEY = 'khsbGa';
  const LIVE = location.hostname.endsWith('kanghanseonbae.com') && !navigator.userAgent.includes('HeadlessChrome');
  let mem = null, loaded = false, box = null, opener = null;
  const get = () => { try { return localStorage.getItem(KEY) ?? mem; } catch (e) { return mem; } };
  const set = v => { mem = v; try { localStorage.setItem(KEY, v); } catch (e) { /* 저장 불가 — 이 페이지에서만 기억 */ } };
  function dropCookies() { // _ga · _ga_<ID> — GA 는 최상위 도메인(.kanghanseonbae.com)에 굽는다
    const host = location.hostname.split('.');
    for (const c of document.cookie.split(';')) {
      const name = c.split('=')[0].trim();
      if (!name.startsWith('_ga')) continue;
      document.cookie = `${name}=; Max-Age=0; path=/`;
      for (let i = 0; i < host.length - 1; i++) document.cookie = `${name}=; Max-Age=0; path=/; domain=${host.slice(i).join('.')}`;
    }
  }
  function start() {
    if (!LIVE) return;
    window['ga-disable-' + SITE.ga] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); }; // 배열 말고 arguments 그대로 넣어야 gtag 가 읽는다
    if (loaded) return; // 이 페이지에서 철회했다가 다시 동의 — 다음 이벤트부터 보낸다
    loaded = true;
    gtag('js', new Date());
    gtag('config', SITE.ga); // page_view 를 보낸다 — UTM 은 GA 가 주소(page_location)에서 읽는다
    document.head.appendChild(Object.assign(document.createElement('script'), { async: true, src: 'https://www.googletagmanager.com/gtag/js?id=' + SITE.ga }));
  }
  function stop() {
    window['ga-disable-' + SITE.ga] = true; // 이 페이지에 이미 실린 gtag.js 도 더는 보내지 않는다
    window.gtag = function () {};
    dropCookies();
  }
  function choose(v) {
    set(v);
    box.hidden = true;
    if (v === '1') start(); else stop();
    if (opener) { opener.focus(); opener = null; } // 푸터에서 열었으면 그 버튼으로 돌려준다
  }
  function open(fromSettings) {
    if (!box) {
      document.body.insertAdjacentHTML('beforeend', `<aside class="gac" aria-label="방문 통계 동의" data-nosnippet>
  <p>방문 통계를 위해 Google Analytics 쿠키를 써도 될까요? 동의하면 본 페이지·유입 경로 같은 방문 기록이 미국 Google 로 전송돼요. 거부해도 홈페이지 이용에는 지장이 없어요. <a href="privacy.html#p10">자세히</a></p>
  <p class="gac-now" hidden></p>
  <div class="gac-btns"><button type="button" class="btn btn-line" data-ga="0">거부</button><button type="button" class="btn btn-dark" data-ga="1">동의</button></div>
</aside>`);
      box = document.body.lastElementChild;
      box.addEventListener('click', e => { const b = e.target.closest('[data-ga]'); if (b) choose(b.dataset.ga); });
    }
    const v = get(), now = box.querySelector('.gac-now');
    now.textContent = v === '1' ? '지금은 동의한 상태예요.' : '지금은 거부한 상태예요.';
    now.hidden = !fromSettings || v === null;
    box.hidden = false;
    if (fromSettings) { opener = document.activeElement; box.querySelector('[data-ga]').focus(); }
  }
  const choice = get();
  if (choice === '1') start();
  else { dropCookies(); if (choice !== '0') open(false); } // 동의 전에 남아 있던 옛 _ga 쿠키도 지운다
  // 전환 버튼 — 페이지는 GA 가 page_location 으로 붙여 준다. GA4 관리 > 이벤트에서 '주요 이벤트'로 표시해 쓴다
  document.addEventListener('click', e => {
    if (e.target.closest('[data-ga-settings]')) return open(true);
    const a = e.target.closest('a[href]');
    if (a?.href.startsWith(SITE.apply)) gtag('event', 'click_apply');
    else if (a?.protocol === 'tel:') gtag('event', 'click_tel');
  });
})();
(() => {
  const body = document.body;
  const page = body.dataset.page || '';
  const dark = body.dataset.gnb === 'dark';
  const cur = key => (key === page ? ' aria-current="page"' : '');
  const badge = (n, tag) => (n.badge ? `<${tag}>${n.badge}</${tag}>` : '');
  const links = SITE_NAV.map(n => `<a href="${n.href}"${cur(n.key)}>${n.label}${badge(n, 'i')}</a>`).join('');
  const dlinks = SITE_NAV.map(n => `<a class="dl" href="${n.href}"${cur(n.key)}><span>${n.label}${badge(n, 'i')}</span></a>`).join('');
  const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  document.currentScript.insertAdjacentHTML('beforebegin', `
<a class="skip-link" href="${location.pathname}${location.search}#main">본문 바로가기</a>
<header class="gnb${dark ? ' is-dark' : ''}" id="gnb">
  <div class="gnb-inner">
    <a class="gnb-logo" href="landing.html" aria-label="강한선배 홈">
      <img class="lb" src="brand/khsb-logo-sm.png" alt="KHSB"><img class="lw" src="brand/khsb-logo-white.png" alt=""><span>강한선배</span>
    </a>
    <div class="gnb-links" role="navigation" aria-label="주요 메뉴">${links}</div>
    <div class="gnb-right">
      <a class="gnb-tel" href="tel:${SITE.tel}">전화 상담</a>
      <a class="btn btn-brand btn-sm" href="${SITE.apply}" target="_blank" rel="noopener">입회 상담</a>
      <button class="gnb-burger" type="button" aria-label="메뉴 열기" aria-expanded="false" aria-controls="gnbDrawer"><i></i><i></i></button>
    </div>
  </div>
</header>
<div class="gnb-drawer" id="gnbDrawer" role="dialog" aria-modal="true" aria-label="전체 메뉴">
  <a class="dl" href="landing.html"${cur('home')}><span>홈</span></a>${dlinks}
  <div class="gd-cta">
    <a class="btn btn-brand" href="${SITE.apply}" target="_blank" rel="noopener">무료 입회 상담 신청${arrow}</a>
    <a class="btn btn-soft" href="tel:${SITE.tel}">전화 상담하기</a>
  </div>
</div>`);
})();
