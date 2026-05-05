import { Trophy, ListChecks, Target, Briefcase, FileText } from "lucide-react";
import {
  INTERNAL_SUBJECT_KEYS,
  MOCK_SUBJECT_KEYS,
  isAdmissionTypeComplete,
  type AdmissionTypeAnswer,
} from "@/lib/online/survey-template";

export function AdmissionTypeSurveyDisplay({
  value,
  gradeNumber,
}: {
  value: AdmissionTypeAnswer;
  gradeNumber: 1 | 2 | 3 | null;
}) {
  const complete = isAdmissionTypeComplete(value, gradeNumber);
  const hasInternal = value.internalGrades.some(
    (g) => !g.unregistered && INTERNAL_SUBJECT_KEYS.some((k) => g.grades[k]?.trim()),
  );
  const registeredMocks = value.mockGrades.filter((m) => !m.unregistered && (m.label || MOCK_SUBJECT_KEYS.some((k) => m.grades[k]?.trim() || m.percentiles[k]?.trim())));
  const filledCards = value.cardStrategy.filter(
    (c) => c.university.trim() || c.department.trim() || c.track || c.fit,
  );
  const empty =
    !value.primaryTrack &&
    !hasInternal &&
    registeredMocks.length === 0 &&
    !value.csatMinimum &&
    filledCards.length === 0 &&
    !value.rationale.trim() &&
    !value.legacyText;

  if (empty) return <p className="text-[12.5px] text-ink-5">(비어 있음)</p>;

  const isJeongsiOnly = value.primaryTrack === "정시 단일";

  return (
    <div className="space-y-3 text-[12.5px] text-ink">
      {value.legacyText && (
        <div className="rounded-[8px] border border-amber-200 bg-amber-50 p-2.5">
          <p className="text-[10.5px] font-semibold text-amber-900 mb-0.5">이전 자유 기술 답변</p>
          <p className="text-[12px] text-amber-900 whitespace-pre-wrap">{value.legacyText}</p>
        </div>
      )}

      {/* 주력 전형 */}
      {value.primaryTrack && (
        <section>
          <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1.5">
            <Trophy className="h-3 w-3" />
            주력 전형
          </h4>
          <div className="rounded-[8px] border border-line bg-canvas p-2.5">
            <span className="rounded-full bg-ink/10 text-ink-2 px-2 py-0.5 text-[11px] font-medium">
              {value.primaryTrack}
            </span>
          </div>
        </section>
      )}

      {/* 내신 */}
      {hasInternal && (
        <section>
          <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1.5">
            <ListChecks className="h-3 w-3" />
            내신 등급
          </h4>
          <div className="overflow-x-auto rounded-[8px] border border-line bg-canvas">
            <table className="w-full text-[12px]">
              <thead className="bg-canvas-2 text-ink-4">
                <tr>
                  <th className="px-2 py-1.5 text-left font-semibold">학기</th>
                  {INTERNAL_SUBJECT_KEYS.map((k) => (
                    <th key={k} className="px-1 py-1.5 text-center font-semibold">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {value.internalGrades
                  .filter((g) => !g.unregistered && INTERNAL_SUBJECT_KEYS.some((k) => g.grades[k]?.trim()))
                  .map((g) => (
                    <tr key={g.semester} className="border-t border-line">
                      <td className="px-2 py-1 font-semibold">{g.semester}</td>
                      {INTERNAL_SUBJECT_KEYS.map((k) => (
                        <td key={k} className="px-1 py-1 text-center tabular-nums">
                          {g.grades[k]?.trim() || <span className="text-ink-5">-</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 모의 */}
      {registeredMocks.length > 0 && (
        <section>
          <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1.5">
            <Target className="h-3 w-3" />
            모의고사 등급
          </h4>
          <div className="space-y-1.5">
            {registeredMocks.map((m, i) => (
              <div key={i} className="rounded-[8px] border border-line bg-canvas p-2.5">
                <p className="font-semibold mb-1">{m.label || <em className="text-ink-5">회차 미입력</em>}</p>
                <table className="w-full text-[11.5px]">
                  <thead className="text-ink-5">
                    <tr>
                      <th className="px-1 py-0.5 text-left font-semibold w-12">항목</th>
                      {MOCK_SUBJECT_KEYS.map((k) => (
                        <th key={k} className="px-1 py-0.5 text-center font-semibold">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-1 py-0.5 text-ink-3">등급</td>
                      {MOCK_SUBJECT_KEYS.map((k) => (
                        <td key={k} className="px-1 py-0.5 text-center tabular-nums">
                          {m.grades[k]?.trim() || <span className="text-ink-5">-</span>}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="px-1 py-0.5 text-ink-3">백분위</td>
                      {MOCK_SUBJECT_KEYS.map((k) => (
                        <td key={k} className="px-1 py-0.5 text-center tabular-nums">
                          {m.percentiles[k]?.trim() || <span className="text-ink-5">-</span>}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 수능 최저 */}
      {value.csatMinimum && (
        <section>
          <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1.5">
            <Briefcase className="h-3 w-3" />
            수능 최저 충족 자신감
          </h4>
          <div className="rounded-[8px] border border-line bg-canvas p-2.5">
            <span className="rounded-full bg-ink/10 text-ink-2 px-2 py-0.5 text-[11px] font-medium">
              {value.csatMinimum}
            </span>
          </div>
        </section>
      )}

      {/* 수시 카드 */}
      {!isJeongsiOnly && filledCards.length > 0 && (
        <section>
          <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1.5">
            <Trophy className="h-3 w-3" />
            수시 카드 전략 ({filledCards.length}장 입력)
          </h4>
          <div className="space-y-1.5">
            {value.cardStrategy.map((c, i) => {
              const filled = c.university || c.department || c.track || c.fit;
              if (!filled) return null;
              return (
                <div key={i} className="rounded-[8px] border border-line bg-canvas p-2.5">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="rounded-full bg-ink text-white text-[10.5px] font-semibold px-1.5 py-0.5">
                      카드 {i + 1}
                    </span>
                    <span className="font-semibold">{c.university || <em className="text-ink-5">대학 미입력</em>}</span>
                    <span className="text-ink-4">·</span>
                    <span>{c.department || <em className="text-ink-5">학과 미입력</em>}</span>
                    {c.track && (
                      <span className="rounded-full bg-ink/10 text-ink-2 px-1.5 py-0.5 text-[10.5px]">{c.track}</span>
                    )}
                    {c.fit && (
                      <span className="rounded-full bg-ink/10 text-ink-2 px-1.5 py-0.5 text-[10.5px]">{c.fit}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 판단 근거 */}
      {value.rationale.trim() && (
        <section>
          <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1.5">
            <FileText className="h-3 w-3" />
            판단 근거
          </h4>
          <div className="rounded-[8px] border border-line bg-canvas p-2.5 whitespace-pre-wrap leading-relaxed">
            {value.rationale}
          </div>
        </section>
      )}

      {!complete && (
        <p className="text-[10.5px] text-amber-700">⚠ 일부 항목이 비어 있어 제출 조건 미충족.</p>
      )}
    </div>
  );
}
