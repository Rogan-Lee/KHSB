// 랜딩 정적 조각 — JS 를 안 돌리는 검색엔진 · AI 크롤러(GPTBot · ClaudeBot · PerplexityBot …)도
// 푸터(메뉴 · 주소 · 사업자 정보), 멘토 카드, 합격 대학, 성과 숫자를 읽게 각 HTML 에 미리 써 둔다.
// 화면은 bx-core.js · mentors-data.js · bx-scenes.js 가 같은 데이터로 다시 그리므로 여기 결과는 크롤러가 보는 스냅숏이다.
//
// 실행: node scripts/landing-static.mjs   (landing/bx-data.js · mentors-data.js 를 바꾼 뒤, 커밋 전에)
//   <!--static:이름--> … <!--/static:이름-->  사이 · <b data-stat="키">…</b> 안 · <span class="bx-cnt" data-to="값">…</span> 안을 다시 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const DIR = path.join(import.meta.dirname, '..', 'landing');
const ctx = vm.createContext({ document: { addEventListener() {} } }); // mentors-data.js 가 맨 위에서 클릭 위임을 건다
for (const f of ['bx-data.js', 'mentors-data.js']) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f });
const run = expr => vm.runInContext(expr, ctx);

const fmt = (v, dec) => Number(v).toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec }); // bx-core · bx-scenes 와 같게
const BLOCKS = {
  footer: run('siteFooterHtml()'),
  'mentors-order': run("MENTOR_ORDER.filter(id => MENTORS[id]).map(mentorCard).join('')"),
  'mentors-featured': run("MENTOR_FEATURED.filter(id => MENTORS[id]).map(mentorCard).join('')"),
  'uwall-more': run('uwallHtml(true)'),
};
const STATS = run('STATS');

// static:faq-ld — 같은 페이지의 아코디언 FAQ(.acc-q / .acc-a-inner)를 FAQPage JSON-LD 로. 화면 문구와 어긋나지 않게 매번 다시 만든다.
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
function faqLd(html, file) {
  const qa = [...html.matchAll(/<div class="acc-q"[^>]*>([\s\S]*?)<span class="acc-pm">[\s\S]*?<div class="acc-a-inner">([\s\S]*?)<\/div>/g)]
    .map(([, q, a]) => ({ '@type': 'Question', name: text(q), acceptedAnswer: { '@type': 'Answer', text: text(a) } }));
  if (!qa.length) throw new Error(`${file}: static:faq-ld 가 있는데 FAQ(.acc-q)가 없습니다`);
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qa };
  return `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`;
}

let changed = 0;
for (const file of fs.readdirSync(DIR).filter(f => f.endsWith('.html'))) {
  const p = path.join(DIR, file);
  const before = fs.readFileSync(p, 'utf8');
  const after = before
    .replace(/<!--static:([\w-]+)-->[\s\S]*?<!--\/static:\1-->/g, (m, name) => {
      const block = name === 'faq-ld' ? faqLd(before, file) : BLOCKS[name];
      if (block === undefined) throw new Error(`${file}: 모르는 조각 static:${name}`);
      return `<!--static:${name}-->${block}<!--/static:${name}-->`;
    })
    .replace(/(<b data-stat="(\w+)">)[\s\S]*?(<\/b>)/g, (m, open, key, close) => {
      const s = STATS[key];
      if (!s) throw new Error(`${file}: STATS 에 없는 키 ${key}`);
      return `${open}${fmt(s.value, s.dec || 0)}<i>${s.unit}</i>${close}`;
    })
    .replace(/(<span class="bx-cnt" data-to="([\d.]+)"(?: data-dec="(\d)")?>)[^<]*(<\/span>)/g,
      (m, open, to, dec, close) => `${open}${fmt(to, Number(dec || 0))}${close}`);
  if (after !== before) { fs.writeFileSync(p, after); changed++; console.log(`갱신 ${file}`); }
}
console.log(changed ? `${changed}개 파일을 고쳤습니다.` : '바뀐 파일이 없습니다.');
