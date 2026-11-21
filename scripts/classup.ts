/**
 * 클래스업 Open API 준비 도구 — 출입 자동 입력(src/lib/classup.ts) 연결 전후에 쓴다.
 * 클래스업 「Open API 설정」에 등록한 공인 IP 에서만 동작한다 (Vercel 은 IP 가 바뀌어 못 씀 → 그래서 웹훅 방식).
 * 키는 .env.local(git 제외)의 CLASSUP_API_KEY 에만 — 저장소·Vercel 에 넣지 말 것(서버는 IP 제약으로 못 씀).
 * 조회 1건마다 문자포인트 1P (ip·webhook 관리는 무료).
 *
 *   npx tsx scripts/classup.ts ip                                  # 지금 회선 공인 IP → 클래스업 허용 IP 에 등록
 *   npx tsx --env-file=.env.local scripts/classup.ts events 2026-11-07 2026-11-08
 *                                                                  # 학생별 입퇴장 흐름 미리 보기, 끝 날짜는 생략 가능 (키오스크가 어떻게 찍는지 확인)
 *   npx tsx --env-file=.env.local scripts/classup.ts students      # 클래스업 학생 ↔ 우리 재원생 이름 대조 (운영 DB 읽기만)
 *   npx tsx --env-file=.env.local scripts/classup.ts webhook:create https://<운영 도메인>/api/webhooks/classup
 *   npx tsx --env-file=.env.local scripts/classup.ts webhook:list
 *   npx tsx --env-file=.env.local scripts/classup.ts webhook:revoke <id>
 */
import { randomUUID } from "node:crypto";

const API = "https://open-api.classup.io";

type Page<T> = { data: T[]; meta?: { nextCursor?: string | null } };
type ClassupStudent = {
  id: number;
  name: string;
  isWithdrawn?: boolean;
  contacts?: { phoneNum: string | null; guardians: { phoneNum: string }[] };
};

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = process.env.CLASSUP_API_KEY?.trim();
  if (!key && path !== "/v1/ip") throw new Error("CLASSUP_API_KEY 환경변수가 필요합니다");
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(method !== "GET" ? { "Idempotency-Key": randomUUID() } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const retry = response.headers.get("retry-after");
    // 집·사무실 회선 IP 는 바뀔 수 있다 — 지금 IP 를 같이 보여 줘서 바로 등록하게
    const ipHint =
      json?.error?.code === "IP_NOT_ALLOWED"
        ? ` → 지금 IP ${(await call<{ data: { ip: string } }>("GET", "/v1/ip")).data.ip} 를 클래스업 허용 IP 에 등록하세요`
        : "";
    throw new Error(
      `${method} ${path} → ${response.status} ${json?.error?.code ?? ""} ${json?.error?.message ?? ""}${retry ? ` (${retry}초 뒤 재시도)` : ""}${ipHint}`,
    );
  }
  return json as T;
}

async function all<T>(path: string, maxPages = 20): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null | undefined;
  for (let i = 0; i < maxPages; i++) {
    const sep = path.includes("?") ? "&" : "?";
    const page = await call<Page<T>>("GET", `${path}${sep}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    rows.push(...page.data);
    cursor = page.meta?.nextCursor;
    if (!cursor || page.data.length < 100) return rows;
  }
  console.warn(`(${maxPages}쪽에서 멈춤 — 기간을 줄여 보세요)`);
  return rows;
}

const kstTime = (iso: string) => iso.slice(11, 16); // occurredAt 은 +09:00 한국시각

async function events(from: string, to = from) {
  const [list, students] = await Promise.all([
    all<{ studentId: number; eventType: string; occurredAt: string }>(`/v1/attendance/events?from=${from}&to=${to}`),
    all<ClassupStudent>("/v1/students"),
  ]);
  const names = new Map(students.map((s) => [s.id, s.name]));
  const byStudentDay = new Map<string, string[]>();
  for (const e of list) {
    const k = `${e.occurredAt.slice(0, 10)}  ${names.get(e.studentId) ?? "?"}(#${e.studentId})`;
    byStudentDay.set(k, [...(byStudentDay.get(k) ?? []), `${kstTime(e.occurredAt)} ${e.eventType}`]);
  }
  for (const [k, flow] of [...byStudentDay].sort()) console.log(`${k}  ${flow.join(" → ")}`);
  const counts = list.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.eventType]: (acc[e.eventType] ?? 0) + 1 }), {});
  console.log(`\n사건 ${list.length}건`, counts);
}

async function students() {
  const { prisma } = await import("@/lib/prisma");
  const { phoneDigits } = await import("@/lib/phone");
  const [theirs, ours] = await Promise.all([
    all<ClassupStudent>("/v1/students"),
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, phone: true, parentPhone: true },
    }),
  ]);
  const active = theirs.filter((s) => !s.isWithdrawn);
  const map: Record<string, string> = {};
  const problems: string[] = [];
  const matchedOurs = new Set<string>();

  for (const s of active) {
    const byName = ours.filter((o) => o.name === s.name.trim());
    if (byName.length === 1) {
      matchedOurs.add(byName[0].id);
      continue; // 웹훅이 이름으로 찾는다 — 대조표 불필요
    }
    // 이름으로 안 되면 학생·보호자 번호로 후보를 찾는다
    const phones = [s.contacts?.phoneNum, ...(s.contacts?.guardians ?? []).map((g) => g.phoneNum)]
      .map(phoneDigits)
      .filter(Boolean);
    const byPhone = ours.filter((o) => phones.includes(phoneDigits(o.phone)) || phones.includes(phoneDigits(o.parentPhone)));
    if (byPhone.length === 1) {
      map[String(s.id)] = byPhone[0].id;
      matchedOurs.add(byPhone[0].id);
      problems.push(`  ${s.name}(#${s.id}) → 번호로 ${byPhone[0].name} 매칭 (대조표에 추가)`);
    } else {
      problems.push(`  ${s.name}(#${s.id}) → ${byName.length > 1 ? "동명이인" : "없음"}, 번호 후보 ${byPhone.length}명 — 직접 확인`);
    }
  }

  console.log(`클래스업 재원 ${active.length}명 / 우리 재원 ${ours.length}명 / 이름 일치 ${active.length - problems.length}명`);
  if (problems.length) console.log(`\n이름으로 못 찾는 학생:\n${problems.join("\n")}`);
  const missing = ours.filter((o) => !matchedOurs.has(o.id)).map((o) => o.name);
  if (missing.length) console.log(`\n클래스업에 없는 우리 재원생: ${missing.join(", ")}`);
  if (Object.keys(map).length) {
    const value = JSON.stringify(map).replace(/'/g, "''");
    console.log(
      `\n대조표 반영 SQL (운영 DB 에서 직접 실행):\n` +
        `INSERT INTO "AppSetting" (key, value, "updatedAt") VALUES ('classup.student_map', '${value}', now())\n` +
        `ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now();`,
    );
  }
  await prisma.$disconnect();
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "ip":
      return console.log((await call<{ data: { ip: string } }>("GET", "/v1/ip")).data.ip);
    case "events":
      if (!args[0]) throw new Error("사용법: events YYYY-MM-DD [YYYY-MM-DD]");
      return events(args[0], args[1]);
    case "students":
      return students();
    case "webhook:create": {
      if (!args[0]?.startsWith("https://")) throw new Error("사용법: webhook:create https://.../api/webhooks/classup");
      const { data } = await call<{ data: { id: string; status: string; signingSecret: string } }>("POST", "/v1/webhooks", {
        url: args[0],
        resources: ["attendance"],
      });
      console.log(`구독 ${data.id} (${data.status})`);
      console.log(`signingSecret: ${data.signingSecret}`);
      console.log("→ 이 값은 다시 볼 수 없습니다. Vercel 환경변수 CLASSUP_WEBHOOK_SECRET 에 넣고 재배포하세요.");
      return;
    }
    case "webhook:list":
      return console.table((await call<{ data: Record<string, unknown>[] }>("GET", "/v1/webhooks")).data);
    case "webhook:revoke":
      if (!args[0]) throw new Error("사용법: webhook:revoke <id>");
      return console.log((await call<{ data: unknown }>("DELETE", `/v1/webhooks/${args[0]}`)).data);
    default:
      console.log("명령: ip | events | students | webhook:create | webhook:list | webhook:revoke (파일 상단 주석 참고)");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
