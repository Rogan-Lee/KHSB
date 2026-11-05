/* eslint-disable @typescript-eslint/no-require-imports -- Vercel 함수(CommonJS), 루트 Next 앱 코드가 아님 */
// 강한 이야기 글 상세 — /stories/:id (vercel.json rewrite → /api/story?id=:id)
// 검색엔진 · AI 크롤러는 JS 를 안 돌리거나 늦게 돌린다. 그래서 제목 · 설명 · 본문 · 구조화 데이터를
// 서버에서 article.html 에 채워 보낸다. 화면은 article.html 의 스크립트가 같은 데이터로 다시 그린다(아바타 · 관련 글 · CTA).
const fs = require('fs');
const path = require('path');

const ORIGIN = 'https://www.kanghanseonbae.com';
const API = 'https://khsb.vercel.app'; // bx-data.js SITE.api 와 같게
const TYPE_LABEL = { review: '후기', mentor: '선배 아티클', director: '원장 칼럼', podcast: '팟캐스트', article: '아티클' }; // bx-core.js 와 같게
const TEMPLATE = fs.readFileSync(path.join(__dirname, '..', 'article.html'), 'utf8');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const json = v => JSON.stringify(v).replace(/</g, '\\u003c'); // <script> 안에 넣어도 </script> 로 끊기지 않게
const abs = u => (/^https?:\/\//i.test(u || '') ? u : `${ORIGIN}/${String(u || '').replace(/^\//, '')}`);
const plain = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);
const fmtDate = d => (d ? new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' }) : '');

function head(p, url) {
  const title = `${p.title} | 강한선배`;
  const desc = cut(p.summary || plain(p.bodyHtml) || `${TYPE_LABEL[p.type] || '이야기'} · 강한선배`, 150);
  const image = abs(p.coverImageUrl || 'photos/bx/hall.jpg');
  const ld = {
    '@context': 'https://schema.org', '@type': 'Article', headline: p.title, description: desc, image,
    datePublished: p.publishedAt, inLanguage: 'ko', mainEntityOfPage: url,
    author: { '@type': 'Person', name: p.authorName || '강한선배', ...(p.authorRole ? { jobTitle: p.authorRole } : {}) },
    publisher: { '@type': 'Organization', name: '강한선배', url: `${ORIGIN}/`, logo: { '@type': 'ImageObject', url: `${ORIGIN}/brand/khsb-logo.png` } },
  };
  return `<title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${esc(image)}">
  <meta property="og:url" content="${url}">
  <meta property="og:site_name" content="강한선배">
  <meta property="og:locale" content="ko_KR">
  ${p.publishedAt ? `<meta property="article:published_time" content="${esc(p.publishedAt)}">` : ''}
  <script type="application/ld+json">${json(ld)}</script>`;
}

// article.html 스크립트가 그리는 머리 · 본문과 같은 마크업 (아바타는 이니셜만 — 사진은 스크립트가 바꿔 끼운다)
function body(p) {
  const type = TYPE_LABEL[p.type] || '이야기';
  return `<article>
    <header class="ar">
      <a class="ar-back" href="stories.html${p.type ? `?type=${esc(p.type)}` : ''}">← 강한 이야기</a><br>
      <span class="ar-type">${type}</span>
      <h1 class="ar-title">${esc(p.title)}</h1>
      ${p.summary ? `<p class="ar-sum">${esc(p.summary)}</p>` : ''}
      <div class="ar-meta"><span class="ar-ava">${esc((p.authorName || '강').trim().charAt(0))}</span>
        <div class="ar-by"><b>${esc(p.authorName || '강한선배')}</b><span>${fmtDate(p.publishedAt)}${p.bodyHtml ? ` · ${p.readingMinutes || 1}분 읽기` : ''}</span></div>
        <button class="btn btn-soft btn-sm ar-share" type="button">링크 복사</button>
      </div>
    </header>
    ${p.coverImageUrl ? `<figure class="ar-cover"><img src="${esc(p.coverImageUrl)}" alt=""></figure>` : ''}
    ${p.bodyHtml ? `<div class="ar-body prose">${p.bodyHtml}</div>` : ''}
  </article>`;
}

module.exports = async (req, res) => {
  const id = String(req.query.id || '');
  let status = 404, data = null;
  if (/^[\w-]{1,64}$/.test(id)) {
    try {
      const r = await fetch(`${API}/api/public/content/${id}`, { headers: { Accept: 'application/json' } });
      if (r.ok) { data = await r.json(); status = 200; } else if (r.status !== 404) status = 502;
    } catch (e) { status = 502; }
  }
  const url = `${ORIGIN}/stories/${id}`;
  let html = TEMPLATE
    .replace('<head>', '<head>\n  <base href="/">') // /stories/ 아래에서도 상대 경로(css · 사진 · 링크)가 사이트 루트 기준으로
    // 글을 못 불러와도 id 는 넘긴다 — 브라우저 스크립트가 다시 시도하고 안내 문구를 띄운다
    .replace('<!--story-data-->', `<script>window.__STORY = ${json({ id, data })};</script>`);
  if (data) {
    html = html
      .replace(/<!--head-->[\s\S]*?<!--\/head-->/, head(data.post, url))
      .replace(/<!--body-->[\s\S]*?<!--\/body-->/, body(data.post));
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', status === 200 ? 's-maxage=300, stale-while-revalidate=600' : 's-maxage=60');
  res.end(html);
};
