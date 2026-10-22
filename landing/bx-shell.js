// ══ 강한선배 GNB 셸 — <body> 맨 앞에서 동기 로드 (bx-data.js 다음) ══
// 스크립트 태그 자리에 GNB·모바일 드로어를 즉시 그려 깜빡임이 없다.
// 페이지는 <body data-page="results" data-gnb="dark|light"> 로 현재 메뉴·히어로 톤을 알린다.
// 방문 통계: GA4(privacy.html 제6·10조에 고지). 모든 페이지가 이 셸을 거치므로 여기서 한 번만 붙인다.
// 운영 도메인에서만 — 로컬·Vercel 미리보기 방문이 통계에 섞이지 않게. 헤드리스 브라우저(점검용 자동 방문·봇)도 뺀다.
if (SITE.ga && location.hostname.endsWith('kanghanseonbae.com') && !navigator.userAgent.includes('HeadlessChrome')) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); }; // 배열 말고 arguments 그대로 넣어야 gtag 가 읽는다
  gtag('js', new Date());
  gtag('config', SITE.ga);
  document.head.appendChild(Object.assign(document.createElement('script'), { async: true, src: 'https://www.googletagmanager.com/gtag/js?id=' + SITE.ga }));
  // 전환 버튼 — 페이지는 GA 가 page_location 으로 붙여 준다. GA4 관리 > 이벤트에서 '주요 이벤트'로 표시해 쓴다
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (a?.href.startsWith(SITE.apply)) gtag('event', 'click_apply');
    else if (a?.protocol === 'tel:') gtag('event', 'click_tel');
  });
}
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
<a class="skip-link" href="#main">본문 바로가기</a>
<header class="gnb${dark ? ' is-dark' : ''}" id="gnb">
  <div class="gnb-inner">
    <a class="gnb-logo" href="landing.html" aria-label="강한선배 홈">
      <img class="lb" src="brand/khsb-logo.png" alt="KHSB"><img class="lw" src="brand/khsb-logo-white.png" alt=""><span>강한선배</span>
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
