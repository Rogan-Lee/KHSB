import { Target, Compass, Scale } from "lucide-react";
import {
  ASPIRATION_LABELS,
  GOALS_PRIORITY_AXIS_OPTIONS,
  GOALS_CAREER_ALIGNMENT_OPTIONS,
  isGoalsComplete,
  type GoalsAnswer,
} from "@/lib/online/survey-template";

const PRIORITY_AXIS_LABEL: Record<string, string> = Object.fromEntries(
  GOALS_PRIORITY_AXIS_OPTIONS.map((o) => [o.value, o.label]),
);
const CAREER_LABEL: Record<string, string> = Object.fromEntries(
  GOALS_CAREER_ALIGNMENT_OPTIONS.map((o) => [o.value, o.label]),
);

export function GoalsSurveyDisplay({ value }: { value: GoalsAnswer }) {
  const complete = isGoalsComplete(value);
  const empty =
    value.aspirations.every((a) => !a.university && !a.department) &&
    !value.priorityAxis &&
    !value.careerAlignment &&
    !value.legacyText;

  if (empty) {
    return <p className="text-[12.5px] text-ink-5">(비어 있음)</p>;
  }

  return (
    <div className="space-y-3 text-[12.5px] text-ink">
      {value.legacyText && (
        <div className="rounded-[8px] border border-amber-200 bg-amber-50 p-2.5">
          <p className="text-[10.5px] font-semibold text-amber-900 mb-0.5">이전 자유 기술 답변</p>
          <p className="text-[12px] text-amber-900 whitespace-pre-wrap">{value.legacyText}</p>
        </div>
      )}

      {/* 1·2·3지망 */}
      {value.aspirations.some((a) => a.university || a.department) && (
        <section>
          <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1.5">
            <Target className="h-3 w-3" />
            희망 대학·학과
          </h4>
          <div className="space-y-1.5">
            {value.aspirations.map((a, i) => {
              const filled = a.university || a.department || a.track || a.fit || a.reason;
              if (!filled) {
                return (
                  <div key={i} className="rounded-[8px] border border-line bg-canvas px-2.5 py-1.5 text-ink-5">
                    <span className="text-[10.5px] font-semibold text-ink-4 mr-2">{ASPIRATION_LABELS[i]}</span>
                    <em>미입력</em>
                  </div>
                );
              }
              return (
                <div key={i} className="rounded-[8px] border border-line bg-canvas p-2.5">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="rounded-full bg-ink text-white text-[10.5px] font-semibold px-1.5 py-0.5">
                      {ASPIRATION_LABELS[i]}
                    </span>
                    <span className="font-semibold">{a.university || <em className="text-ink-5">대학 미입력</em>}</span>
                    <span className="text-ink-4">·</span>
                    <span>{a.department || <em className="text-ink-5">학과 미입력</em>}</span>
                    {a.track && (
                      <span className="rounded-full bg-ink/10 text-ink-2 px-1.5 py-0.5 text-[10.5px]">{a.track}</span>
                    )}
                    {a.fit && (
                      <span className="rounded-full bg-ink/10 text-ink-2 px-1.5 py-0.5 text-[10.5px]">{a.fit}</span>
                    )}
                  </div>
                  {a.reason && (
                    <p className="mt-1.5 text-[12px] text-ink-3 whitespace-pre-wrap">
                      <span className="text-[10.5px] font-semibold text-ink-4 mr-1">선택 이유:</span>
                      {a.reason}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 우선순위 축 */}
      {value.priorityAxis && (
        <section>
          <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1.5">
            <Scale className="h-3 w-3" />
            우선순위 축
          </h4>
          <div className="rounded-[8px] border border-line bg-canvas p-2.5">
            <span className="rounded-full bg-ink/10 text-ink-2 px-2 py-0.5 text-[11px] font-medium">
              {PRIORITY_AXIS_LABEL[value.priorityAxis] ?? value.priorityAxis}
            </span>
          </div>
        </section>
      )}

      {/* 진로 일치 */}
      {value.careerAlignment && (
        <section>
          <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1.5">
            <Compass className="h-3 w-3" />
            진로 일치 여부
          </h4>
          <div className="rounded-[8px] border border-line bg-canvas p-2.5">
            <span className="rounded-full bg-ink/10 text-ink-2 px-2 py-0.5 text-[11px] font-medium">
              {CAREER_LABEL[value.careerAlignment] ?? value.careerAlignment}
            </span>
          </div>
        </section>
      )}

      {!complete && (
        <p className="text-[10.5px] text-amber-700">⚠ 일부 항목이 비어 있어 제출 조건 미충족.</p>
      )}
    </div>
  );
}
