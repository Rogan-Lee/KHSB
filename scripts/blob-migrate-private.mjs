// 학생 관련 첨부를 공개 Vercel Blob → 비공개 저장소로 옮긴다 (src/lib/blob-store.ts · src/app/api/files).
// DB 의 기존 URL 칸 값을 공개 URL → 앱 내부 경로 `/api/files/<pathname>` 으로 바꾼다 (스키마 변경 없음).
//
// 사용 (환경변수로 받는다 — 값은 커밋하지 않는다):
//   node --env-file=<env 파일> scripts/blob-migrate-private.mjs                         # 기본: dry-run (대상·건수만)
//   node --env-file=<env 파일> scripts/blob-migrate-private.mjs --apply --confirm-db=<위에 찍힌 DB>
//   … --apply --confirm-db=<DB> --delete-public                                        # 옮긴 뒤 공개 원본까지 삭제
// 선택: --limit=20 (처음 N개 파일만 — 시험용), --verbose (대상 경로 전부 출력)
//
// 필요한 환경변수: DATABASE_URL, BLOB_READ_WRITE_TOKEN(공개 저장소), BLOB_PRIVATE_READ_WRITE_TOKEN(비공개 저장소, --apply 때)
// 순서: 비공개 저장소 토큰을 넣은 코드가 배포된 뒤에 실행한다 (먼저 바꾸면 /api/files 가 없는 서버가 파일을 못 보여 준다).
// 여러 번 돌려도 된다 — 이미 내부 경로인 값은 대상에서 빠지고, 비공개 쪽은 덮어쓴다.
import { del, put } from "@vercel/blob";
import pg from "pg";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

const APPLY = flag("apply");
const DELETE_PUBLIC = flag("delete-public");
const VERBOSE = flag("verbose");
const LIMIT = Number(option("limit") ?? Infinity);

// src/lib/file-access.ts 의 경로 규칙과 같다 — 이 prefix 아래 파일만 비공개로 옮긴다 (study-plans/ 등 공개 콘텐츠는 그대로)
const PRIVATE_PREFIXES = [
  "family-chat/",
  "portal-chat/",
  "online/chats/",
  "online/tasks/",
  "online/feedback/",
  "mentoring/",
  "mentoring-sessions/",
  "assignments/",
  "student-questions/",
  "photos/",
];

// [테이블, 칸, 형식] — text 는 URL 하나, json 은 [{ url, … }] 배열
const TARGETS = [
  ["Photo", "url", "text"],
  ["Photo", "thumbnailUrl", "text"],
  ["MentoringSessionPhoto", "url", "text"],
  ["MentoringSessionPhoto", "thumbnailUrl", "text"],
  ["AssignmentFile", "url", "text"],
  ["PortalChatMessage", "attachments", "json"],
  ["FamilyChatMessage", "attachments", "json"],
  ["QuestionMessage", "attachments", "json"],
  ["TaskSubmission", "files", "json"],
  ["TaskFeedback", "files", "json"],
  ["TaskResult", "finalFiles", "json"],
];

const PUBLIC_HOST = ".public.blob.vercel-storage.com";

function die(message) {
  console.error(message);
  process.exit(1);
}

// src/lib/blob-store.ts 의 encodeSegment / fileUrlForPathname 과 같아야 한다
const encodeSegment = (s) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const fileUrlForPathname = (pathname) => `/api/files/${pathname.split("/").map(encodeSegment).join("/")}`;
const isSafePathname = (p) =>
  p.length > 0 && p.length <= 1024 && !/[\\\u0000-\u001f\u007f]/.test(p) && p.split("/").every((s) => s && s !== "." && s !== "..");

/** 옮길 대상인 공개 URL 이면 blob pathname, 아니면 null */
function privatePathnameOf(url) {
  if (typeof url !== "string") return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !u.hostname.endsWith(PUBLIC_HOST)) return null;
  let pathname;
  try {
    pathname = u.pathname.slice(1).split("/").map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
  return PRIVATE_PREFIXES.some((p) => pathname.startsWith(p)) ? pathname : null;
}

const storeIdOf = (token) => token?.split("_")[3] ?? "?";

// ─────────────────────────── 대상 DB 확인 ───────────────────────────

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) die("DATABASE_URL 이 없습니다");
const dbUrl = new URL(rawUrl);
dbUrl.searchParams.delete("pgbouncer");
dbUrl.searchParams.delete("connection_limit");
const dbHost = dbUrl.host;
// Supabase 풀러는 호스트가 같고 사용자 이름(postgres.<ref>)으로 프로젝트가 갈린다
const dbRef = decodeURIComponent(dbUrl.username).split(".")[1];
const dbLabel = dbRef ? `${dbRef}@${dbHost}` : dbHost;

const PUBLIC_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const PRIVATE_TOKEN = process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;

console.log(`DB: ${dbLabel}`);
console.log(`공개 저장소: ${storeIdOf(PUBLIC_TOKEN)} · 비공개 저장소: ${PRIVATE_TOKEN ? storeIdOf(PRIVATE_TOKEN) : "(없음)"}`);
console.log(APPLY ? `모드: 적용${DELETE_PUBLIC ? " + 공개 원본 삭제" : ""}` : "모드: dry-run (아무것도 바꾸지 않음)");

if (APPLY) {
  if (option("confirm-db") !== dbLabel) die(`--apply 에는 --confirm-db=${dbLabel} 가 필요합니다 (대상 DB 를 눈으로 확인)`);
  if (!PRIVATE_TOKEN) die("BLOB_PRIVATE_READ_WRITE_TOKEN 이 없습니다");
  if (DELETE_PUBLIC && !PUBLIC_TOKEN) die("--delete-public 에는 BLOB_READ_WRITE_TOKEN 이 필요합니다");
  if (storeIdOf(PRIVATE_TOKEN) === storeIdOf(PUBLIC_TOKEN)) die("공개·비공개 토큰이 같은 저장소입니다");
} else if (DELETE_PUBLIC) {
  die("--delete-public 은 --apply 와 함께만 씁니다");
}

const client = new pg.Client({ connectionString: dbUrl.toString() });
await client.connect();

// ─────────────────────────── 대상 수집 ───────────────────────────

/** publicUrl → pathname */
const files = new Map();
/** 바꿀 행: { table, column, kind, id, value } */
const rows = [];
const perColumn = [];

for (const [table, column, kind] of TARGETS) {
  const where =
    kind === "text" ? `"${column}" LIKE $1` : `"${column}"::text LIKE $1`;
  const { rows: found } = await client.query(
    `SELECT id, "${column}" AS value FROM "${table}" WHERE ${where}`,
    [`%${PUBLIC_HOST}/%`],
  );
  let count = 0;
  for (const row of found) {
    const urls = kind === "text" ? [row.value] : Array.isArray(row.value) ? row.value.map((a) => a?.url) : [];
    const targets = urls.filter((u) => privatePathnameOf(u));
    if (targets.length === 0) continue;
    count++;
    rows.push({ table, column, kind, id: row.id, value: row.value });
    for (const u of targets) files.set(u, privatePathnameOf(u));
  }
  perColumn.push(`${table}.${column}: ${count}행`);
}

const perPrefix = Object.fromEntries(PRIVATE_PREFIXES.map((p) => [p, 0]));
for (const pathname of files.values()) {
  const prefix = PRIVATE_PREFIXES.find((p) => pathname.startsWith(p));
  perPrefix[prefix]++;
}
console.log("\n바꿀 행");
for (const line of perColumn) console.log(`  ${line}`);
console.log("\n옮길 파일 (경로별)");
for (const [prefix, n] of Object.entries(perPrefix)) if (n > 0) console.log(`  ${prefix}: ${n}개`);
console.log(`  합계: ${files.size}개 파일 · ${rows.length}행`);
if (VERBOSE) for (const pathname of files.values()) console.log(`  - ${pathname}`);

if (!APPLY) {
  await client.end();
  console.log("\ndry-run 끝. 적용하려면 --apply --confirm-db=" + dbLabel);
  process.exit(0);
}

// ─────────────────────────── 1) 비공개 저장소로 복사 ───────────────────────────

/** publicUrl → 저장할 내부 경로 (복사 성공한 것만) */
const moved = new Map();
const failures = [];
const queue = [...files.entries()].slice(0, LIMIT);
let done = 0;

async function copyOne([publicUrl, pathname]) {
  if (!isSafePathname(pathname)) {
    failures.push(`${pathname} — 경로에 쓸 수 없는 문자`);
    return;
  }
  const res = await fetch(publicUrl);
  if (!res.ok) {
    failures.push(`${pathname} — 공개 원본 ${res.status}`);
    return;
  }
  const body = Buffer.from(await res.arrayBuffer());
  const blob = await put(pathname, body, {
    access: "private",
    token: PRIVATE_TOKEN,
    contentType: res.headers.get("content-type") ?? undefined,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  moved.set(publicUrl, fileUrlForPathname(blob.pathname));
}

// ponytail: 동시 4개 — 파일 수가 수만 개로 늘면 동시 수를 올린다
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      try {
        await copyOne(next);
      } catch (error) {
        failures.push(`${next[1]} — ${error instanceof Error ? error.message : error}`);
      }
      if (++done % 50 === 0) console.log(`  복사 ${done}/${Math.min(files.size, LIMIT)}`);
    }
  }),
);
console.log(`\n복사: ${moved.size}개 성공 · ${failures.length}개 실패`);

// ─────────────────────────── 2) DB 값 교체 ───────────────────────────

let updated = 0;
let skipped = 0;
/** 아직 공개 URL 을 가리키는 행이 남은 파일 — 공개 원본을 지우면 안 된다 */
const stillReferenced = new Set();

for (const row of rows) {
  const swap = (u) => moved.get(u) ?? u;
  const next =
    row.kind === "text"
      ? swap(row.value)
      : row.value.map((a) => (a && typeof a === "object" && typeof a.url === "string" ? { ...a, url: swap(a.url) } : a));
  const urls = row.kind === "text" ? [row.value] : row.value.map((a) => a?.url);
  const changed = urls.some((u) => moved.has(u));
  if (!changed) continue;

  // 읽은 뒤 다른 사람이 바꾼 행은 건너뛴다 (다음 실행에서 다시 잡힌다)
  const result =
    row.kind === "text"
      ? await client.query(`UPDATE "${row.table}" SET "${row.column}" = $1 WHERE id = $2 AND "${row.column}" = $3`, [
          next,
          row.id,
          row.value,
        ])
      : await client.query(
          `UPDATE "${row.table}" SET "${row.column}" = $1::jsonb WHERE id = $2 AND "${row.column}" = $3::jsonb`,
          [JSON.stringify(next), row.id, JSON.stringify(row.value)],
        );
  if (result.rowCount === 1) {
    updated++;
  } else {
    skipped++;
    for (const u of urls) if (moved.has(u)) stillReferenced.add(u);
  }
}
console.log(`DB: ${updated}행 교체 · ${skipped}행 건너뜀(그 사이 바뀜)`);

// ─────────────────────────── 3) 공개 원본 삭제 (선택) ───────────────────────────

if (DELETE_PUBLIC) {
  const deletable = [...moved.keys()].filter((u) => !stillReferenced.has(u));
  let deleted = 0;
  for (let i = 0; i < deletable.length; i += 100) {
    const batch = deletable.slice(i, i + 100);
    try {
      await del(batch, { token: PUBLIC_TOKEN });
      deleted += batch.length;
    } catch (error) {
      failures.push(`공개 원본 삭제 ${batch.length}개 — ${error instanceof Error ? error.message : error}`);
    }
  }
  console.log(`공개 원본 삭제: ${deleted}개`);
}

if (failures.length > 0) {
  console.log("\n실패 (DB 값은 그대로 — 다시 돌리면 이어서 한다)");
  for (const line of failures) console.log(`  - ${line}`);
}
await client.end();
