import { GraduationCap, PieChart, MapPin, Lightbulb } from "lucide-react";
import {
  HISTORY_MIX_KEYS,
  HISTORY_MIX_LABELS,
  isHistoryComplete,
  type HistoryAnswer,
} from "@/lib/online/survey-template";

export function HistorySurveyDisplay({ value }: { value: HistoryAnswer }) {
  const complete = isHistoryComplete(value);
  const empty =
    value.hasPriorEducation === "" &&
    !value.studyPlace &&
    value.priorConsulting.had === "" &&
    HISTORY_MIX_KEYS.every((k) => value.currentMix[k] === 0) &&
    !value.legacyText;

  if (empty) {
    return <p className="text-[12.5px] text-ink-5">(비어 있음)</p>;
  }

  const mixSum = HISTORY_MIX_KEYS.reduce((acc, k) => acc + value.currentMix[k], 0);

  return (
    <div className="space-y-3 text-[12.5px] text-ink">
      {value.legacyText && (
        <div className="rounded-[8px] border border-amber-200 bg-amber-50 p-2.5">
          <p className="text-[10.5px] font-semibold text-amber-900 mb-0.5">이전 자유 기술 답변</p>
          <p className="text-[12px] text-amber-900 whitespace-pre-wrap">{value.legacyText}</p>
        </div>
      )}

      {/* 이전 학습 경험 */}
      {value.hasPriorEducation && (
        <section>
          <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1.5">
            <GraduationCap className="h-3 w-3" />
            이전 학습 경험
          </h4>
          {value.hasPriorEducation === "no" ? (
            <p className="rounded-[8px] border border-line bg-canvas px-3 py-2 text-ink-3">없음</p>
          ) : (
            <div className="space-y-1.5">
              {value.priorEducation.map((p, i) => (
                <div key={i} className="rounded-[8px] border border-line bg-canvas p-2.5">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-semibold">
                      {p.institution || <em className="text-ink-5">기관 미입력</em>}
                    </span>
                    {p.format && (
                      <span className="rounded-full bg-ink/10 text-ink-2 px-1.5 py-0.5 text-[10.5px]">
                        {p.format}
                      </span>
                    )}
                    {(p.periodFrom || p.periodTo) && (
                      <span className="text-[11px] text-ink-4">
                        {p.periodFrom || "?"} ~ {p.periodTo || "?"}
                      </span>
                    )}
                  </div>
                  {p.subjects.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.subjects.map((s) => (
                        <span key={s} className="rounded-full bg-ink/10 text-ink-2 px-1.5 py-0.5 text-[10.5px]">
                          {s === "기타" && p.subjectOther ? `기타: ${p.subjectOther}` : s}
                        </span>
                      ))}
                    </div>
                  )}
                  {p.quitReason && (
                    <p className="mt-1.5 text-[12px] text-ink-3 whitespace-pre-wrap">
                      <span className="text-[10.5px] font-semibold text-ink-4 mr-1">그만둔 이유:</span>
                      {p.quitReason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 학습 시간 분배 */}
      {mixSum > 0 && (
        <section>
          <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1.5">
            <PieChart className="h-3 w-3" />
            학습 시간 분배
            <span className={`ml-1 tabular-nums ${mixSum === 100 ? "text-emerald-600" : "text-amber-600"}`}>
              ({mixSum}%)
            </span>
          </h4>
          <div className="rounded-[8px] border border-line bg-canvas p-2.5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {HISTORY_MIX_KEYS.map((k) => (
                <div key={k} className="flex items-center justify-between text-[12px]">
                  <span className="text-ink-3">{HISTORY_MIX_LABELS[k]}</span>
                  <span className="font-semibold tabular-nums">{value.currentMix[k]}%</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 학습 장소 */}
      {value.studyPlace && (
        <section>
          <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1.5">
            <MapPin className="h-3 w-3" />
            주 학습 장소
          </h4>
          <div className="rounded-[8px] border border-line bg-canvas p-2.5">
            <span className="rounded-full bg-ink/10 text-ink-2 px-2 py-0.5 text-[11px] font-medium">
              {value.studyPlace}
            </span>
            {value.studyPlace === "기타" && value.studyPlaceOther && (
              <span className="ml-2 text-ink">→ {value.studyPlaceOther}</span>
            )}
          </div>
        </section>
      )}

      {/* 입시 컨설팅 */}
      {value.priorConsulting.had && (
        <section>
          <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1.5">
            <Lightbulb className="h-3 w-3" />
            이전 입시 컨설팅
          </h4>
          {value.priorConsulting.had === "no" ? (
            <p className="rounded-[8px] border border-line bg-canvas px-3 py-2 text-ink-3">없음</p>
          ) : (
            <div className="rounded-[8px] border border-line bg-canvas p-2.5 space-y-1">
              <p>
                <span className="text-[10.5px] font-semibold text-ink-4 mr-1">기관:</span>
                {value.priorConsulting.institution || <em className="text-ink-5">미입력</em>}
              </p>
              <p>
                <span className="text-[10.5px] font-semibold text-ink-4 mr-1">시기:</span>
                {value.priorConsulting.period || <em className="text-ink-5">미입력</em>}
              </p>
              <p>
                <span className="text-[10.5px] font-semibold text-ink-4 mr-1">만족도:</span>
                {value.priorConsulting.satisfaction
                  ? `${value.priorConsulting.satisfaction} / 5`
                  : <em className="text-ink-5">미입력</em>}
              </p>
            </div>
          )}
        </section>
      )}

      {!complete && (
        <p className="text-[10.5px] text-amber-700">⚠ 일부 항목이 비어 있어 제출 조건 미충족.</p>
      )}
    </div>
  );
}
