import { FileText, Award, AlertTriangle } from "lucide-react";

type MeritType = "MERIT" | "DEMERIT";

export type NotesSectionMerit = {
  id: string;
  date: Date | string;
  type: MeritType;
  points: number;
  reason: string;
  category: string | null;
  visibleInReport: boolean;
};

export type NotesSectionMonthlyNote = {
  id: string;
  content: string;
  visibleInReport: boolean;
  authorName?: string | null;
  createdAt?: Date | string;
};

interface NotesSectionProps {
  studentId: string;
  year: number;
  month: number;
  monthlyNote?: NotesSectionMonthlyNote | null;
  merits: NotesSectionMerit[];
}

/**
 * 학부모 리포트 — 원생 기록(MonthlyNote) + 상벌점(MeritDemerit) 묶음 섹션.
 * `visibleInReport=true` 인 항목만 노출. 두 섹션 모두 빈 경우 아무것도 렌더하지 않음.
 * 멘토링/월간 리포트에서 공통 사용.
 */
export function NotesSection({ year, month, monthlyNote, merits }: NotesSectionProps) {
  const visibleMonthlyNote =
    monthlyNote && monthlyNote.visibleInReport && monthlyNote.content?.trim() ? monthlyNote : null;
  const visibleMerits = merits.filter((m) => m.visibleInReport);

  if (!visibleMonthlyNote && visibleMerits.length === 0) return null;

  const merit = visibleMerits.filter((m) => m.type === "MERIT");
  const demerit = visibleMerits.filter((m) => m.type === "DEMERIT");

  function fmtDate(d: Date | string) {
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  }

  return (
    <div className="space-y-3">
      {visibleMonthlyNote && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-teal-500 shrink-0" />
              <p className="text-sm font-bold text-gray-800">원생 기록</p>
              <span className="ml-auto text-[11px] text-gray-400">
                {year}년 {month}월
              </span>
            </div>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {visibleMonthlyNote.content}
            </p>
          </div>
        </div>
      )}

      {visibleMerits.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-500 shrink-0" />
              <p className="text-sm font-bold text-gray-800">상벌점</p>
              <span className="ml-auto text-[11px] text-gray-400">
                {visibleMerits.length}건
              </span>
            </div>
          </div>
          <div className="px-5 py-4 space-y-4">
            {merit.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Award className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">
                    상점 {merit.length}건 · +{merit.reduce((s, m) => s + m.points, 0)}점
                  </p>
                </div>
                <ul className="space-y-1.5">
                  {merit.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-start gap-2 text-sm text-gray-800 bg-emerald-50/60 border border-emerald-100 rounded-lg px-3 py-2"
                    >
                      <span className="text-[11px] text-emerald-600 font-medium shrink-0 mt-0.5">
                        {fmtDate(m.date)}
                      </span>
                      <span className="text-emerald-700 font-semibold shrink-0">+{m.points}</span>
                      <span className="flex-1 leading-relaxed">
                        {m.category ? <span className="text-[11px] text-gray-500 mr-1">[{m.category}]</span> : null}
                        {m.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {demerit.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                  <p className="text-[11px] font-semibold text-rose-700 uppercase tracking-wide">
                    벌점 {demerit.length}건 · -{demerit.reduce((s, m) => s + m.points, 0)}점
                  </p>
                </div>
                <ul className="space-y-1.5">
                  {demerit.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-start gap-2 text-sm text-gray-800 bg-rose-50/60 border border-rose-100 rounded-lg px-3 py-2"
                    >
                      <span className="text-[11px] text-rose-600 font-medium shrink-0 mt-0.5">
                        {fmtDate(m.date)}
                      </span>
                      <span className="text-rose-700 font-semibold shrink-0">-{m.points}</span>
                      <span className="flex-1 leading-relaxed">
                        {m.category ? <span className="text-[11px] text-gray-500 mr-1">[{m.category}]</span> : null}
                        {m.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
