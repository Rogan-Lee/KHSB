"use client";

import { useEffect, useRef, useState } from "react";
import { Target, Compass, Scale } from "lucide-react";
import { upsertSurveySection } from "@/actions/online/onboarding-survey";
import {
  ASPIRATION_LABELS,
  GOALS_TRACK_OPTIONS,
  GOALS_FIT_OPTIONS,
  GOALS_PRIORITY_AXIS_OPTIONS,
  GOALS_CAREER_ALIGNMENT_OPTIONS,
  isGoalsComplete,
  type Aspiration,
  type GoalsAnswer,
} from "@/lib/online/survey-template";

const AUTOSAVE_DELAY_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "error";

export function GoalsSurveyStep({
  studentToken,
  sectionKey,
  initial,
  isSubmitted,
  onValidityChange,
}: {
  studentToken: string;
  sectionKey: string;
  initial: GoalsAnswer;
  isSubmitted: boolean;
  onValidityChange?: (valid: boolean) => void;
}) {
  const [value, setValue] = useState<GoalsAnswer>(initial);
  const [status, setStatus] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string>(JSON.stringify(initial));

  useEffect(() => {
    if (isSubmitted) return;
    const serialized = JSON.stringify(value);
    if (serialized === lastSaved.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setStatus("saving");
      try {
        await upsertSurveySection({
          studentToken,
          sectionKey,
          answer: value as unknown as Record<string, unknown>,
        });
        lastSaved.current = serialized;
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 1500);
      } catch {
        setStatus("error");
      }
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, studentToken, sectionKey, isSubmitted]);

  useEffect(() => {
    onValidityChange?.(isGoalsComplete(value));
  }, [value, onValidityChange]);

  function updateAspiration(idx: number, patch: Partial<Aspiration>) {
    setValue((v) => ({
      ...v,
      aspirations: v.aspirations.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    }));
  }

  const inputBase =
    "w-full rounded-[8px] border border-line bg-canvas px-3 py-2 text-[12.5px] text-ink focus:outline-none focus:border-line-strong disabled:opacity-60";

  return (
    <div className="space-y-5">
      <div className="text-[11px] text-ink-5 text-right h-3">
        {status === "saving" && "저장 중…"}
        {status === "saved" && "저장됨"}
        {status === "error" && <span className="text-red-600">저장 실패</span>}
      </div>

      {value.legacyText && (
        <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-3">
          <p className="text-[11px] font-semibold text-amber-900 mb-1">이전 자유 기술 답변</p>
          <p className="text-[12px] text-amber-900 whitespace-pre-wrap">{value.legacyText}</p>
          <p className="text-[10.5px] text-amber-800 mt-2">
            참고용으로만 보입니다. 아래 항목별로 다시 작성해 주세요.
          </p>
        </div>
      )}

      {/* 1·2·3지망 */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink">희망 대학·학과 (1·2·3지망)</h3>
        </div>
        {value.aspirations.map((a, i) => (
          <div key={i} className="rounded-[10px] border border-line bg-panel p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-ink text-white text-[11px] font-semibold px-2 py-0.5">
                {ASPIRATION_LABELS[i]}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                type="text"
                value={a.university}
                onChange={(e) => updateAspiration(i, { university: e.target.value })}
                disabled={isSubmitted}
                placeholder="대학 (예: 서울대학교)"
                className={inputBase}
              />
              <input
                type="text"
                value={a.department}
                onChange={(e) => updateAspiration(i, { department: e.target.value })}
                disabled={isSubmitted}
                placeholder="학과 (예: 경영학과)"
                className={inputBase}
              />
            </div>
            <div>
              <p className="text-[11px] text-ink-4 mb-1.5">지원 전형</p>
              <div className="flex flex-wrap gap-1.5">
                {GOALS_TRACK_OPTIONS.map((t) => {
                  const checked = a.track === t.value;
                  return (
                    <label
                      key={t.value}
                      className={`cursor-pointer inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] ${
                        checked ? "border-ink bg-ink text-white" : "border-line text-ink-3 hover:border-line-strong"
                      } ${isSubmitted ? "pointer-events-none opacity-50" : ""}`}
                    >
                      <input
                        type="radio"
                        name={`track-${i}`}
                        checked={checked}
                        onChange={() => updateAspiration(i, { track: t.value })}
                        disabled={isSubmitted}
                        className="sr-only"
                      />
                      {t.label}
                    </label>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-[11px] text-ink-4 mb-1.5">난이도 분류</p>
              <div className="flex flex-wrap gap-1.5">
                {GOALS_FIT_OPTIONS.map((f) => {
                  const checked = a.fit === f.value;
                  return (
                    <label
                      key={f.value}
                      className={`cursor-pointer inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] ${
                        checked ? "border-ink bg-ink text-white" : "border-line text-ink-3 hover:border-line-strong"
                      } ${isSubmitted ? "pointer-events-none opacity-50" : ""}`}
                    >
                      <input
                        type="radio"
                        name={`fit-${i}`}
                        checked={checked}
                        onChange={() => updateAspiration(i, { fit: f.value })}
                        disabled={isSubmitted}
                        className="sr-only"
                      />
                      {f.label}
                    </label>
                  );
                })}
              </div>
            </div>
            <textarea
              value={a.reason}
              onChange={(e) => updateAspiration(i, { reason: e.target.value })}
              disabled={isSubmitted}
              placeholder="이 대학·학과를 선택한 이유 (1-2줄)"
              rows={2}
              className={`${inputBase} resize-y`}
            />
          </div>
        ))}
      </section>

      {/* 우선순위 축 */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Scale className="h-3.5 w-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink">우선순위 축</h3>
          <span className="text-[10.5px] text-ink-5">(상충 시 무엇을 우선?)</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {GOALS_PRIORITY_AXIS_OPTIONS.map((opt) => {
            const checked = value.priorityAxis === opt.value;
            return (
              <label
                key={opt.value}
                className={`cursor-pointer inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-[12px] ${
                  checked ? "border-ink bg-ink text-white" : "border-line text-ink-3 hover:border-line-strong"
                } ${isSubmitted ? "pointer-events-none opacity-50" : ""}`}
              >
                <input
                  type="radio"
                  name="priorityAxis"
                  checked={checked}
                  onChange={() => setValue((v) => ({ ...v, priorityAxis: opt.value }))}
                  disabled={isSubmitted}
                  className="sr-only"
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      </section>

      {/* 진로 일치 */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Compass className="h-3.5 w-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink">진로 일치 여부</h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {GOALS_CAREER_ALIGNMENT_OPTIONS.map((opt) => {
            const checked = value.careerAlignment === opt.value;
            return (
              <label
                key={opt.value}
                className={`cursor-pointer inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-[12px] ${
                  checked ? "border-ink bg-ink text-white" : "border-line text-ink-3 hover:border-line-strong"
                } ${isSubmitted ? "pointer-events-none opacity-50" : ""}`}
              >
                <input
                  type="radio"
                  name="careerAlignment"
                  checked={checked}
                  onChange={() => setValue((v) => ({ ...v, careerAlignment: opt.value }))}
                  disabled={isSubmitted}
                  className="sr-only"
                />
                {opt.label}
              </label>
            );
          })}
        </div>
        {value.careerAlignment === "undecided" && (
          <div className="rounded-[8px] border border-amber-200 bg-amber-50 p-2.5 text-[11.5px] text-amber-900">
            진로가 아직 미정이어도 괜찮습니다. 컨설턴트가 학과 탐색부터 함께 잡아 드릴 거예요.
            가능하면 관심 있는 분야(예: 이공계열, 인문사회, 예체능 등)를 위 1·2·3지망 학과 칸에 적어 주세요.
          </div>
        )}
      </section>
    </div>
  );
}
