// /sitemap.xml (vercel.json rewrite) — 고정 페이지 + 본문이 있는 강한 이야기 글(/stories/:id). 새 글은 배포 없이 바로 들어간다.
const ORIGIN = 'https://www.kanghanseonbae.com';
const API = 'https://khsb.vercel.app'; // bx-data.js SITE.api 와 같게
// 검색에 걸릴 페이지만 — 페이지를 새로 만들면 여기에 추가. mentor.html?id= 은 mentors.html 링크로 찾아간다.
const PAGES = ['', 'program.html', 'care-study.html', 'care-life.html', 'care-ops.html', 'space.html', 'mentors.html',
  'results.html', 'director.html', 'recruit.html', 'stories.html', 'support.html', 'privacy.html', 'terms.html'];

module.exports = async (req, res) => {
  let posts = [];
  try {
    // ponytail: API 상한 50개 — 글이 50개를 넘으면 페이지를 나눠 받아야 한다
    const r = await fetch(`${API}/api/public/content?limit=50`, { headers: { Accept: 'application/json' } });
    if (r.ok) posts = ((await r.json()).posts || []).filter(p => p.hasBody && /^[\w-]{1,64}$/.test(p.id));
  } catch (e) { /* 글 목록을 못 받아도 고정 페이지는 내보낸다 */ }
  const urls = [
    ...PAGES.map(p => `<url><loc>${ORIGIN}/${p}</loc></url>`),
    ...posts.map(p => `<url><loc>${ORIGIN}/stories/${p.id}</loc>${p.publishedAt ? `<lastmod>${p.publishedAt.slice(0, 10)}</lastmod>` : ''}</url>`),
  ];
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
};
