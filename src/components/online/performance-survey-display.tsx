import { BookOpen, Beaker, Compass, Package } from "lucide-react";
import {
  CAREER_LEVELS,
  isPerformanceComplete,
  type PerformanceAnswer,
} from "@/lib/online/survey-template";

const CAREER_LABEL: Record<string, string> = Object.fromEntries(
  CAREER_LEVELS.map((c) => [c.value, c.label]),
);

export function PerformanceSurveyDisplay({ value }: { value: PerformanceAnswer }) {
  const complete = isPerformanceComplete(value);
  const empty = value.subjects.every((s) => !s.subject && !s.topic) &&
    value.books.every((b) => !b.title) &&
    !value.careerLevel &&
    value.outputs.length === 0 &&
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

      {/* 과목별 탐구 */}
      {value.subjects.some((s) => s.subject || s.topic) && (
        <section>
          <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1.5">
            <Beaker className="h-3 w-3" />
            과목별 탐구 경험
          </h4>
          <div className="space-y-1.5">
            {value.subjects.map((s, i) => (
              <div key={i} className="rounded-[8px] border border-line bg-canvas p-2.5">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-semibold">{s.subject || <em className="text-ink-5">과목 미입력</em>}</span>
                  <span className="text-ink-4">·</span>
                  <span>{s.topic || <em className="text-ink-5">주제 미입력</em>}</span>
                </div>
                {s.methods.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.methods.map((m) => (
                      <span key={m} className="rounded-full bg-ink/10 text-ink-2 px-1.5 py-0.5 text-[10.5px]">
                        {m === "기타" && s.methodOther ? `기타: ${s.methodOther}` : m}
                      </span>
                    ))}
                  </div>
                )}
                {s.selfRole && (
                  <p className="mt-1.5 text-[12px] text-ink-3 whitespace-pre-wrap leading-relaxed">
                    <span className="text-[10.5px] font-semibold text-ink-4 mr-1">주도 부분:</span>
                    {s.selfRole}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 교과 연계 독서 */}
      {value.books.some((b) => b.title) && (
        <section>
          <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1.5">
            <BookOpen className="h-3 w-3" />
            교과 연계 독서
          </h4>
          <div className="space-y-1.5">
            {value.books.map((b, i) => (
              <div key={i} className="rounded-[8px] border border-line bg-canvas p-2.5">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-semibold">{b.title || <em className="text-ink-5">제목 미입력</em>}</span>
                  {b.linkedSubject && (
                    <span className="rounded-full bg-ink/10 text-ink-2 px-1.5 py-0.5 text-[10.5px]">{b.linkedSubject}</span>
                  )}
                </div>
                {b.reason && (
                  <p className="mt-1 text-[12px] text-ink-3 whitespace-pre-wrap">
                    <span className="text-[10.5px] font-semibold text-ink-4 mr-1">읽은 이유:</span>
                    {b.reason}
                  </p>
                )}
                {b.expansion && (
                  <p className="mt-1 text-[12px] text-ink-3 whitespace-pre-wrap">
                    <span className="text-[10.5px] font-semibold text-ink-4 mr-1">확장 탐구:</span>
                    {b.expansion}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 진로 탐색 */}
      {value.careerLevel && (
        <section>
          <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1.5">
            <Compass className="h-3 w-3" />
            진로 탐색 수준
          </h4>
          <div className="rounded-[8px] border border-line bg-canvas p-2.5">
            <span className="rounded-full bg-ink/10 text-ink-2 px-2 py-0.5 text-[11px] font-medium">
              {CAREER_LABEL[value.careerLevel] ?? value.careerLevel}
            </span>
            {value.careerLevel === "specified" && value.careerDetail && (
              <span className="ml-2 text-ink">→ {value.careerDetail}</span>
            )}
          </div>
        </section>
      )}

      {/* 활동 결과물 */}
      {value.outputs.length > 0 && (
        <section>
          <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1.5">
            <Package className="h-3 w-3" />
            활동 결과물
          </h4>
          <div className="flex flex-wrap gap-1">
            {value.outputs.map((o) => (
              <span key={o} className="rounded-full bg-ink/10 text-ink-2 px-2 py-0.5 text-[11px]">
                {o === "기타" && value.outputOther ? `기타: ${value.outputOther}` : o}
              </span>
            ))}
          </div>
        </section>
      )}

      {!complete && (
        <p className="text-[10.5px] text-amber-700">⚠ 일부 항목이 비어 있어 제출 조건 미충족.</p>
      )}
    </div>
  );
}
