import { startOfMonth, endOfMonth } from "date-fns";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

interface NotesSectionProps {
  studentId: string;
  year: number;
  month: number;
}

/**
 * 학부모 리포트(월간/멘토링)에서 공통 사용하는 "특이사항 / 상벌점" 섹션.
 *
 * - 해당 학생/월의 `MonthlyNote` + `MeritDemerit` 중 `visibleInReport: true` 만 노출.
 * - 둘 다 비어 있으면 섹션 자체를 렌더하지 않음 (빈 placeholder 보여주지 않음).
 *
 * 서버 컴포넌트로, 프리즈마에서 직접 페치. async 컴포넌트로 사용:
 *   <NotesSection studentId={...} year={...} month={...} />
 */
export async function NotesSection({ studentId, year, month }: NotesSectionProps) {
  const start = startOfMonth(new Date(year, month - 1));
  const end = endOfMonth(new Date(year, month - 1));

  const [notes, merits] = await Promise.all([
    prisma.monthlyNote.findMany({
      where: {
        studentId,
        year,
        month,
        visibleInReport: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.meritDemerit.findMany({
      where: {
        studentId,
        date: { gte: start, lte: end },
        visibleInReport: true,
      },
      orderBy: { date: "asc" },
    }),
  ]);

  // 둘 다 비어있으면 섹션 자체 숨김
  if (notes.length === 0 && merits.length === 0) {
    return null;
  }

  const meritItems = merits.filter((m) => m.type === "MERIT");
  const demeritItems = merits.filter((m) => m.type === "DEMERIT");

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">특이사항 / 상벌점</h3>

      {notes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">월간 특이사항</p>
          <ul className="space-y-1.5">
            {notes.map((n) => (
              <li
                key={n.id}
                className="rounded-lg border bg-card px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap"
              >
                {n.content}
              </li>
            ))}
          </ul>
        </div>
      )}

      {merits.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            상벌점 (상점 {meritItems.length}건 · 벌점 {demeritItems.length}건)
          </p>
          <ul className="space-y-1">
            {merits.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2 text-sm rounded-lg border bg-card px-3 py-1.5"
              >
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatDate(m.date)}
                </span>
                <span
                  className={
                    m.type === "MERIT"
                      ? "text-green-600 font-medium"
                      : "text-red-600 font-medium"
                  }
                >
                  {m.type === "MERIT" ? "+" : "-"}
                  {m.points}
                </span>
                {m.category && (
                  <span className="text-xs text-muted-foreground">[{m.category}]</span>
                )}
                <span className="flex-1 text-foreground/90">{m.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
