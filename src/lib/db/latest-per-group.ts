import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// 그룹(예: studentId)별 최신 N건의 id 만 DB 에서 고른다 — Supabase egress 절감용.
//
// Prisma 의 목록 + 중첩 `take`(예: student.findMany({ select: { mentorings: { take: 1 } } }))는
// DB 에서 그룹별로 잘리지 않는다. 부모 id 전체에 대해 자식 행을 "전부" 가져온 뒤 메모리에서 자르므로
// 자식 테이블이 커질수록 전송량이 폭증한다(멘토링 리포트 발송 목록이 호출당 ~1,000행·본문 포함).
// 목록 화면에서는 이 헬퍼로 그룹별 최신 id 만 고른 뒤 `findMany({ where: { id: { in } }, select })` 로
// 필요한 컬럼만 조회한다.

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function ident(name: string): Prisma.Sql {
  // 식별자는 코드 상수만 허용 — 사용자 입력이 들어오면 안 된다.
  if (!IDENT.test(name)) throw new Error(`잘못된 식별자: ${name}`);
  return Prisma.raw(`"${name}"`);
}

export type LatestPerGroupOptions = {
  /** 테이블(모델)명. 예: "Mentoring" */
  table: string;
  /** 그룹 컬럼. 예: "studentId" */
  groupBy: string;
  /** 그룹 값 목록. 비어 있으면 쿼리하지 않는다. */
  groupIds: readonly string[];
  /**
   * 그룹 안 정렬(앞이 우선). Prisma `orderBy` 와 같은 의미 — Postgres 기본값대로
   * DESC 는 NULL 이 먼저, ASC 는 NULL 이 나중이다. 필요하면 nulls 로 명시.
   */
  orderBy: ReadonlyArray<{ column: string; dir: "asc" | "desc"; nulls?: "first" | "last" }>;
  /** 추가 조건 — 반드시 Prisma.sql 템플릿으로(값은 파라미터 바인딩). 예: Prisma.sql`"status" = 'COMPLETED'` */
  where?: Prisma.Sql;
  /** 그룹당 개수(기본 1). */
  take?: number;
};

/**
 * 그룹별 최신 `take`건의 id 를 그룹 순서 무관하게 반환한다.
 * take=1 이면 DISTINCT ON, 그 외엔 ROW_NUMBER() 로 DB 에서 자른다.
 *
 * @example
 * const ids = await latestIdsPerGroup({
 *   table: "Mentoring", groupBy: "studentId", groupIds: studentIds,
 *   orderBy: [{ column: "actualDate", dir: "desc" }, { column: "scheduledAt", dir: "desc" }],
 *   where: Prisma.sql`"status" = 'COMPLETED'`,
 * });
 * const rows = await prisma.mentoring.findMany({ where: { id: { in: ids } }, select: { ... } });
 */
export async function latestIdsPerGroup(opts: LatestPerGroupOptions): Promise<string[]> {
  if (opts.groupIds.length === 0) return [];
  const take = opts.take ?? 1;
  if (!Number.isInteger(take) || take < 1) throw new Error("take 는 1 이상의 정수여야 합니다");

  const table = ident(opts.table);
  const group = ident(opts.groupBy);
  const order = Prisma.join(
    opts.orderBy.map((o) =>
      Prisma.sql`${ident(o.column)} ${Prisma.raw(o.dir === "asc" ? "ASC" : "DESC")}${
        o.nulls ? Prisma.raw(o.nulls === "first" ? " NULLS FIRST" : " NULLS LAST") : Prisma.empty
      }`,
    ),
    ", ",
  );
  const where = Prisma.sql`${group} = ANY(${[...opts.groupIds]}::text[])${
    opts.where ? Prisma.sql` AND (${opts.where})` : Prisma.empty
  }`;

  const rows =
    take === 1
      ? await prisma.$queryRaw<{ id: string }[]>`
          SELECT DISTINCT ON (${group}) "id" FROM ${table}
          WHERE ${where}
          ORDER BY ${group}, ${order}`
      : await prisma.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM (
            SELECT "id", ROW_NUMBER() OVER (PARTITION BY ${group} ORDER BY ${order}) AS rn
            FROM ${table} WHERE ${where}
          ) ranked WHERE rn <= ${take}`;
  return rows.map((r) => r.id);
}
