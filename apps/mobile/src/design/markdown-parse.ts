// 가벼운 마크다운 파서 — 리포트·공지·콘텐츠를 앱 안에서 그리기 위한 부분집합.
// 지원: 제목(#~###), 문단(줄바꿈 유지), 목록(순서/비순서, 1단계 중첩), 인용, 구분선, 코드블록, 표(GFM), 이미지,
//       굵게/기울임/취소선/인라인 코드/링크/자동 링크.
// 작성 습관 보정(웹 <Prose> 와 동일): 한 줄 `[제목]` · 줄 전체가 굵은 `**제목**` → 소제목.
// React 의존이 없는 순수 함수라 노드로 바로 테스트할 수 있다.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'br' }
  | { t: 'bold'; c: Inline[] }
  | { t: 'italic'; c: Inline[] }
  | { t: 'strike'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] };

export type ListItem = { content: Inline[]; children: Block | null };

export type Block =
  | { t: 'heading'; level: 1 | 2 | 3; c: Inline[] }
  | { t: 'paragraph'; c: Inline[] }
  | { t: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { t: 'quote'; blocks: Block[] }
  | { t: 'hr' }
  | { t: 'code'; v: string }
  | { t: 'image'; src: string; alt: string }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] };

// ─── Inline ──────────────────────────────────────────────────────────

const INLINE_RE =
  /(\*\*|__)(?=\S)([\s\S]+?)\1|~~(?=\S)([\s\S]+?)~~|`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(\*|_)([^\s*_](?:[^*_\n]*[^\s*_])?)\7|(https?:\/\/[^\s<>()]+[^\s<>().,!?'"])/;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  const pushText = (v: string) => {
    if (!v) return;
    const parts = v.split('\n');
    parts.forEach((p, i) => {
      if (i > 0) out.push({ t: 'br' });
      if (p) out.push({ t: 'text', v: p.replace(/\\([\\`*_{}[\]()#+\-.!~|])/g, '$1') });
    });
  };
  while (rest.length > 0) {
    const m = INLINE_RE.exec(rest);
    if (!m) {
      pushText(rest);
      break;
    }
    pushText(rest.slice(0, m.index));
    if (m[1]) out.push({ t: 'bold', c: parseInline(m[2]) });
    else if (m[3] != null) out.push({ t: 'strike', c: parseInline(m[3]) });
    else if (m[4] != null) out.push({ t: 'code', v: m[4] });
    else if (m[5] != null) out.push({ t: 'link', href: m[6], c: parseInline(m[5]) });
    else if (m[7]) out.push({ t: 'italic', c: parseInline(m[8]) });
    else if (m[9]) out.push({ t: 'link', href: m[9], c: [{ t: 'text', v: m[9] }] });
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

/** 인라인 → 순수 텍스트 (접근성 라벨·미리보기용) */
export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((n) =>
      n.t === 'text' || n.t === 'code' ? n.v : n.t === 'br' ? '\n' : 'c' in n ? inlineText(n.c) : ''
    )
    .join('');
}

// ─── Block ───────────────────────────────────────────────────────────

const RE = {
  fence: /^\s*(```|~~~)/,
  heading: /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/,
  bracketHeading: /^\s*\[([^\]\n]{1,40})\]\s*$/,
  boldHeading: /^\s*\*\*([^*\n]{1,40}?)\s*[:：]?\*\*\s*[:：]?\s*$/,
  hr: /^\s{0,3}([-*_])(\s*\1){2,}\s*$/,
  quote: /^\s{0,3}>\s?(.*)$/,
  ul: /^(\s*)[-*+]\s+(.*)$/,
  ol: /^(\s*)(\d{1,3})[.)]\s+(.*)$/,
  image: /^\s*!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/,
  tableRow: /^\s*\|.*\|\s*$/,
  tableSep: /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/,
};

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => parseInline(c.trim()));

export function parseMarkdown(source: string | null | undefined): Block[] {
  if (!source) return [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  return parseLines(lines);
}

function parseLines(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    const text = para.join('\n').trim();
    if (text) blocks.push({ t: 'paragraph', c: parseInline(text) });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.trim()) {
      flush();
      continue;
    }

    // 코드블록
    if (RE.fence.test(line)) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !RE.fence.test(lines[i])) body.push(lines[i++]);
      blocks.push({ t: 'code', v: body.join('\n') });
      continue;
    }

    let m: RegExpMatchArray | null;
    if ((m = line.match(RE.heading))) {
      flush();
      const level = Math.min(3, m[1].length) as 1 | 2 | 3;
      blocks.push({ t: 'heading', level, c: parseInline(m[2]) });
      continue;
    }
    if ((m = line.match(RE.bracketHeading)) || (m = line.match(RE.boldHeading))) {
      const title = m[1].trim();
      if (!/[.!?。]$/.test(title)) {
        flush();
        blocks.push({ t: 'heading', level: 3, c: parseInline(title) });
        continue;
      }
    }
    if (RE.hr.test(line)) {
      flush();
      blocks.push({ t: 'hr' });
      continue;
    }
    if ((m = line.match(RE.image))) {
      flush();
      blocks.push({ t: 'image', alt: m[1], src: m[2] });
      continue;
    }
    if (RE.quote.test(line)) {
      flush();
      const inner: string[] = [];
      while (i < lines.length && (m = lines[i].match(RE.quote))) {
        inner.push(m[1]);
        i++;
      }
      i--;
      blocks.push({ t: 'quote', blocks: parseLines(inner) });
      continue;
    }
    if (RE.tableRow.test(line) && i + 1 < lines.length && RE.tableSep.test(lines[i + 1])) {
      flush();
      const head = splitRow(line);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && RE.tableRow.test(lines[i])) rows.push(splitRow(lines[i++]));
      i--;
      blocks.push({ t: 'table', head, rows });
      continue;
    }
    if (RE.ul.test(line) || RE.ol.test(line)) {
      flush();
      const listLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        (RE.ul.test(lines[i]) || RE.ol.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))
      ) {
        listLines.push(lines[i]);
        i++;
      }
      i--;
      // 같은 들여쓰기에서 기호 종류(순서/비순서)가 바뀌면 목록을 나눈다
      const base = listLines[0].match(/^\s*/)![0].length;
      let group: string[] = [];
      let kind: 'ul' | 'ol' | null = null;
      for (const l of listLines) {
        const indent = l.match(/^\s*/)![0].length;
        const k = RE.ol.test(l) ? 'ol' : RE.ul.test(l) ? 'ul' : null;
        if (k && indent <= base + 1 && kind && k !== kind) {
          blocks.push(parseList(group));
          group = [];
        }
        if (k && indent <= base + 1) kind = k;
        group.push(l);
      }
      if (group.length) blocks.push(parseList(group));
      continue;
    }

    para.push(line);
  }
  flush();
  return blocks;
}

function parseList(lines: string[]): Block {
  const first = lines[0];
  const baseIndent = first.match(/^\s*/)![0].length;
  const olm = first.match(RE.ol);
  const ordered = !!olm && olm[1].length === baseIndent;
  const start = ordered ? Number(olm![2]) : 1;
  const items: { head: string; sub: string[] }[] = [];

  for (const line of lines) {
    const indent = line.match(/^\s*/)![0].length;
    const um = line.match(RE.ul);
    const om = line.match(RE.ol);
    const isItem = (um || om) && indent <= baseIndent + 1;
    if (isItem) {
      items.push({ head: (um ? um[2] : om![3]).trim(), sub: [] });
    } else if (items.length > 0) {
      const last = items[items.length - 1];
      if ((um || om) && indent > baseIndent + 1) last.sub.push(line.slice(Math.min(indent, baseIndent + 2)));
      else last.head += '\n' + line.trim();
    }
  }

  return {
    t: 'list',
    ordered,
    start,
    items: items.map((it) => ({
      content: parseInline(it.head),
      children: it.sub.length ? parseList(it.sub) : null,
    })),
  };
}
