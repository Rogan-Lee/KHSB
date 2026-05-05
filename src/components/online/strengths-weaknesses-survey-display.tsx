import { BookOpen, Brain, Timer, AlertTriangle, Compass } from "lucide-react";
import {
  isStrengthsWeaknessesComplete,
  type StrengthsWeaknessesAnswer,
} from "@/lib/online/survey-template";

export function StrengthsWeaknessesSurveyDisplay({ value }: { value: StrengthsWeaknessesAnswer }) {
  const complete = isStrengthsWeaknessesComplete(value);
  const empty =
    value.bySubject.every((s) => !s.subject && !s.level) &&
    value.studyHabits.length === 0 &&
    !value.focusMinutes.trim() &&
    value.testAnxiety === 0 &&
    value.selfDirection === 0 &&
    !value.legacyText;

  if (empty) return <p className="text-[12.5px] text-ink-5">(비어 있음)</p>;

  return (
    <div className="space-y-3 text-[12.5px] text-ink">
      {value.legacyText && (
        <div className="rounded-[8px] border border-amber-200 bg-amber-50 p-2.5">
          <p className="text-[10.5px] font-semibold text-amber-900 mb-0.5">이전 자유 기술 답변</p>
          <p className="text-[12px] text-amber-900 whitespace-pre-wrap">{value.legacyText}</p>
        </div>
      )}

      {/* 과목별 강·약 */}
      {value.bySubject.some((s) => s.subject || s.level) && (
        <section>
          <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1.5">
            <BookOpen className="h-3 w-3" />
            과목별 강·약
          </h4>
          <div className="space-y-1.5">
            {value.bySubject.map((s, i) => {
              const filled = s.subject || s.level || s.internalGrade || s.mockGrade || s.weakAreas.length || s.reason;
              if (!filled) return null;
              return (
                <div key={i} className="rounded-[8px] border border-line bg-canvas p-2.5">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-semibold">{s.subject || <em className="text-ink-5">과목 미입력</em>}</span>
                    {s.level && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-medium ${
                        s.level === "강" ? "bg-emerald-100 text-emerald-800" :
                        s.level === "중" ? "bg-amber-100 text-amber-800" :
                        "bg-red-100 text-red-800"
                      }`}>
                        {s.level}
                      </span>
                    )}
                    {(s.internalGrade || s.mockGrade) && (
                      <span className="text-[11px] text-ink-4 tabular-nums">
                        내신 {s.internalGrade || "-"} / 모의 {s.mockGrade || "-"}
                      </span>
                    )}
                  </div>
                  {s.weakAreas.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.weakAreas.map((a) => (
                        <span key={a} className="rounded-full bg-ink/10 text-ink-2 px-1.5 py-0.5 text-[10.5px]">
                          {a === "기타" && s.weakAreaOther ? `기타: ${s.weakAreaOther}` : a}
                        </span>
                      ))}
                    </div>
                  )}
                  {s.reason && (
                    <p className="mt-1.5 text-[12px] text-ink-3 whitespace-pre-wrap">
                      <span className="text-[10.5px] font-semibold text-ink-4 mr-1">사유:</span>
                      {s.reason}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 학습 습관 */}
      {value.studyHabits.length > 0 && (
        <section>
          <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1.5">
            <Brain className="h-3 w-3" />
            학습 습관
          </h4>
          <div className="flex flex-wrap gap-1">
            {value.studyHabits.map((h) => (
              <span key={h} className="rounded-full bg-ink/10 text-ink-2 px-2 py-0.5 text-[11px]">
                {h}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* 집중 가능 시간 */}
      {value.focusMinutes.trim() && (
        <section>
          <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1.5">
            <Timer className="h-3 w-3" />
            평균 집중 가능 시간
          </h4>
          <div className="rounded-[8px] border border-line bg-canvas p-2.5">
            <span className="font-semibold tabular-nums">{value.focusMinutes}</span>
            <span className="ml-1 text-ink-4">분</span>
          </div>
        </section>
      )}

      {/* 시험 불안도 */}
      {value.testAnxiety > 0 && (
        <section>
          <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            시험 불안도
          </h4>
          <ScaleDisplay value={value.testAnxiety} />
        </section>
      )}

      {/* 자기주도 수준 */}
      {value.selfDirection > 0 && (
        <section>
          <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1.5">
            <Compass className="h-3 w-3" />
            자기주도 수준
          </h4>
          <ScaleDisplay value={value.selfDirection} />
        </section>
      )}

      {!complete && (
        <p className="text-[10.5px] text-amber-700">⚠ 일부 항목이 비어 있어 제출 조건 미충족.</p>
      )}
    </div>
  );
}

function ScaleDisplay({ value }: { value: number }) {
  return (
    <div className="rounded-[8px] border border-line bg-canvas p-2.5 inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`h-6 w-6 inline-flex items-center justify-center rounded text-[11px] font-semibold tabular-nums ${
            n === value ? "bg-ink text-white" : "bg-canvas-2 text-ink-5"
          }`}
        >
          {n}
        </span>
      ))}
    </div>
  );
}
