import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

import { Prisma } from "@/generated/prisma/client";
import { latestIdsPerGroup } from "@/lib/db/latest-per-group";
import { prisma } from "@/lib/prisma";

const queryRaw = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;

/** 태그드 템플릿 호출을 최종 SQL·바인딩 값으로 복원 */
function lastQuery() {
  const [strings, ...values] = queryRaw.mock.calls.at(-1)!;
  const q = Prisma.sql(strings as TemplateStringsArray, ...values);
  return { sql: q.text.replace(/\s+/g, " ").trim(), values: q.values };
}

const order = [
  { column: "actualDate", dir: "desc" as const },
  { column: "scheduledAt", dir: "desc" as const },
];

beforeEach(() => {
  vi.clearAllMocks();
  queryRaw.mockResolvedValue([{ id: "m1" }, { id: "m2" }]);
});

describe("latestIdsPerGroup", () => {
  it("take=1 은 DISTINCT ON 으로 그룹별 1건만 고른다", async () => {
    const ids = await latestIdsPerGroup({
      table: "Mentoring",
      groupBy: "studentId",
      groupIds: ["s1", "s2"],
      orderBy: order,
      where: Prisma.sql`"status" = ${"COMPLETED"}`,
    });
    expect(ids).toEqual(["m1", "m2"]);
    const { sql, values } = lastQuery();
    expect(sql).toBe(
      'SELECT DISTINCT ON ("studentId") "id" FROM "Mentoring" WHERE "studentId" = ANY($1::text[]) AND ("status" = $2) ORDER BY "studentId", "actualDate" DESC, "scheduledAt" DESC',
    );
    expect(values).toEqual([["s1", "s2"], "COMPLETED"]);
  });

  it("take>1 은 ROW_NUMBER 로 자르고 NULLS 지정을 반영한다", async () => {
    await latestIdsPerGroup({
      table: "Communication",
      groupBy: "studentId",
      groupIds: ["s1"],
      orderBy: [{ column: "createdAt", dir: "asc", nulls: "last" }],
      take: 30,
    });
    const { sql, values } = lastQuery();
    expect(sql).toBe(
      'SELECT "id" FROM ( SELECT "id", ROW_NUMBER() OVER (PARTITION BY "studentId" ORDER BY "createdAt" ASC NULLS LAST) AS rn FROM "Communication" WHERE "studentId" = ANY($1::text[]) ) ranked WHERE rn <= $2',
    );
    expect(values).toEqual([["s1"], 30]);
  });

  it("그룹이 비면 쿼리하지 않는다", async () => {
    expect(await latestIdsPerGroup({ table: "Mentoring", groupBy: "studentId", groupIds: [], orderBy: order })).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("식별자에 SQL 이 섞이면 거부한다", async () => {
    await expect(
      latestIdsPerGroup({ table: 'Mentoring"; DROP TABLE x; --', groupBy: "studentId", groupIds: ["s1"], orderBy: order }),
    ).rejects.toThrow("잘못된 식별자");
    await expect(
      latestIdsPerGroup({ table: "Mentoring", groupBy: "studentId", groupIds: ["s1"], orderBy: order, take: 0 }),
    ).rejects.toThrow();
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
