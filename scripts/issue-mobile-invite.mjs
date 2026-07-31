// 로컬 테스트용: 모바일 앱 "초대 가입"에 쓸 초대 토큰을 dev DB에 발급하고 평문 토큰을 출력.
// 사용: node scripts/issue-mobile-invite.mjs [staffEmail]
// env: .env.local 의 DATABASE_URL (dev) 사용
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

function loadEnv() {
  const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const m = txt.match(/^DATABASE_URL=(.*)$/m);
  if (!m) throw new Error(".env.local 에 DATABASE_URL 없음");
  return m[1].trim().replace(/^"|"$/g, "");
}

function sanitize(raw) {
  const u = new URL(raw);
  ["pgbouncer", "connection_limit", "pool_timeout", "statement_cache_size"].forEach((k) =>
    u.searchParams.delete(k),
  );
  return u.toString();
}

const APP_URL = "http://localhost:3000";
// 사용: node scripts/issue-mobile-invite.mjs            → 직원(원장) 초대
//       node scripts/issue-mobile-invite.mjs student   → 학생 초대
//       node scripts/issue-mobile-invite.mjs <이메일>   → 특정 직원 초대
const arg = process.argv[2];
const isStudent = arg === "student";
const targetEmail = isStudent ? undefined : arg;

const client = new pg.Client({ connectionString: sanitize(loadEnv()) });
await client.connect();

try {
  let target;
  let inviteType;

  if (isStudent) {
    inviteType = "STUDENT";
    const { rows } = await client.query(
      `SELECT s.id, s.name, s.grade AS role, NULL AS email
         FROM "Student" s
         LEFT JOIN "AuthUser" a ON a."studentId" = s.id
        WHERE s.status = 'ACTIVE' AND a.id IS NULL
        ORDER BY s.name
        LIMIT 5`,
    );
    if (rows.length === 0) {
      console.error("❌ 초대할 ACTIVE 학생이 없습니다 (또는 모두 이미 계정 연결됨).");
      process.exit(2);
    }
    target = rows[0];
  } else {
    inviteType = "STAFF";
    const { rows } = await client.query(
      `SELECT u.id, u.name, u.role, u.email
         FROM "User" u
         LEFT JOIN "AuthUser" a ON a."appUserId" = u.id
        WHERE u.status = 'ACTIVE' AND a.id IS NULL
          ${targetEmail ? "AND u.email = $1" : ""}
        ORDER BY CASE u.role WHEN 'DIRECTOR' THEN 0 WHEN 'ADMIN' THEN 1 WHEN 'MENTOR' THEN 2 ELSE 3 END
        LIMIT 5`,
      targetEmail ? [targetEmail] : [],
    );
    if (rows.length === 0) {
      console.error("❌ 초대할 ACTIVE 직원이 없습니다 (또는 모두 이미 계정 연결됨). 시드가 필요할 수 있습니다.");
      process.exit(2);
    }
    target = rows[0];
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const id = "inv_" + randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // 발급자(invitedById)는 유효한 직원이어야 함
  let inviterId = target.id;
  if (isStudent) {
    const { rows } = await client.query(
      `SELECT id FROM "User" WHERE status = 'ACTIVE'
        ORDER BY CASE role WHEN 'DIRECTOR' THEN 0 WHEN 'ADMIN' THEN 1 ELSE 2 END LIMIT 1`,
    );
    if (rows.length === 0) {
      console.error("❌ 발급자로 쓸 ACTIVE 직원이 없습니다.");
      process.exit(2);
    }
    inviterId = rows[0].id;
  }

  const targetCol = isStudent ? "targetStudentId" : "targetUserId";
  await client.query(
    `UPDATE "AuthInvitation" SET "revokedAt" = now()
      WHERE "${targetCol}" = $1 AND "acceptedAt" IS NULL AND "revokedAt" IS NULL`,
    [target.id],
  );
  await client.query(
    `INSERT INTO "AuthInvitation"
       ("id","type","tokenHash","${targetCol}","invitedById","expiresAt","createdAt")
     VALUES ($1,$2,$3,$4,$5,$6, now())`,
    [id, inviteType, tokenHash, target.id, inviterId, expiresAt],
  );

  console.log("\n✅ 초대 발급 완료");
  console.log("────────────────────────────────────────");
  console.log(`대상 ${isStudent ? "학생" : "직원"} : ${target.name} (${target.role}) ${target.email ?? ""}`);
  console.log(`만료      : ${expiresAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`);
  console.log("\n📱 모바일 앱 '초대 가입' 탭에 아래 토큰(또는 링크)을 붙여넣으세요:\n");
  console.log(`토큰: ${token}`);
  console.log(`링크: ${APP_URL}/sign-up?token=${encodeURIComponent(token)}`);
  console.log("\n그다음 아이디(4~30자 영숫자)와 비밀번호(10자 이상)를 설정하면 로그인됩니다.");
  console.log("────────────────────────────────────────\n");
} finally {
  await client.end();
}
