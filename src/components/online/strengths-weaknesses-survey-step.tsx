"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, BookOpen, Brain, Timer, AlertTriangle, Compass } from "lucide-react";
import { upsertSurveySection } from "@/actions/online/onboarding-survey";
import {
  SW_LEVEL_OPTIONS,
  SW_WEAK_AREA_OPTIONS,
  SW_HABIT_OPTIONS,
  emptySubjectStrength,
  isStrengthsWeaknessesComplete,
  type StrengthsWeaknessesAnswer,
  type SubjectStrength,
} from "@/lib/online/survey-template";

const AUTOSAVE_DELAY_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "error";

export function StrengthsWeaknessesSurveyStep({
  studentToken,
  sectionKey,
  initial,
  isSubmitted,
  onValidityChange,
}: {
  studentToken: string;
  sectionKey: string;
  initial: StrengthsWeaknessesAnswer;
  isSubmitted: boolean;
  onValidityChange?: (valid: boolean) => void;
}) {
  const [value, setValue] = useState<StrengthsWeaknessesAnswer>(initial);
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
    onValidityChange?.(isStrengthsWeaknessesComplete(value));
  }, [value, onValidityChange]);

  function updateSubject(idx: number, patch: Partial<SubjectStrength>) {
    setValue((v) => ({
      ...v,
      bySubject: v.bySubject.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  }
  function toggleWeakArea(idx: number, area: string) {
    setValue((v) => ({
      ...v,
      bySubject: v.bySubject.map((s, i) => {
        if (i !== idx) return s;
        const next = s.weakAreas.includes(area)
          ? s.weakAreas.filter((a) => a !== area)
          : [...s.weakAreas, area];
        return { ...s, weakAreas: next };
      }),
    }));
  }
  function addSubject() {
    setValue((v) => ({ ...v, bySubject: [...v.bySubject, emptySubjectStrength()] }));
  }
  function removeSubject(idx: number) {
    setValue((v) => ({ ...v, bySubject: v.bySubject.filter((_, i) => i !== idx) }));
  }
  function toggleHabit(habit: string) {
    setValue((v) => {
      const next = v.studyHabits.includes(habit)
        ? v.studyHabits.filter((h) => h !== habit)
        : [...v.studyHabits, habit];
      return { ...v, studyHabits: next };
    });
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

      {/* 1. 과목별 강·약 */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink">과목별 강·약</h3>
        </div>
        {value.bySubject.map((s, i) => (
          <div key={i} className="rounded-[10px] border border-line bg-panel p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-ink-4">과목 {i + 1}</span>
              {value.bySubject.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSubject(i)}
                  disabled={isSubmitted}
                  className="text-ink-5 hover:text-red-600 disabled:opacity-40"
                  title="삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <input
              type="text"
              value={s.subject}
              onChange={(e) => updateSubject(i, { subject: e.target.value })}
              disabled={isSubmitted}
              placeholder="과목명 (예: 수학 / 국어 / 생명과학Ⅰ)"
              className={inputBase}
            />
            <div>
              <p className="text-[11px] text-ink-4 mb-1.5">강·중·약</p>
              <div className="flex gap-1.5">
                {SW_LEVEL_OPTIONS.map((opt) => {
                  const checked = s.level === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={`cursor-pointer inline-flex items-center justify-center rounded-md border w-12 py-1.5 text-[12px] font-semibold ${
                        checked ? "border-ink bg-ink text-white" : "border-line text-ink-3 hover:border-line-strong"
                      } ${isSubmitted ? "pointer-events-none opacity-50" : ""}`}
                    >
                      <input
                        type="radio"
                        name={`level-${i}`}
                        checked={checked}
                        onChange={() => updateSubject(i, { level: opt.value })}
                        disabled={isSubmitted}
                        className="sr-only"
                      />
                      {opt.label}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[10.5px] text-ink-4">내신 등급</span>
                <input
                  type="number"
                  step={0.1}
                  min={1}
                  max={9}
                  value={s.internalGrade}
                  onChange={(e) => updateSubject(i, { internalGrade: e.target.value })}
                  disabled={isSubmitted}
                  placeholder="-"
                  className={inputBase}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10.5px] text-ink-4">모의 등급</span>
                <input
                  type="number"
                  step={1}
                  min={1}
                  max={9}
                  value={s.mockGrade}
                  onChange={(e) => updateSubject(i, { mockGrade: e.target.value })}
                  disabled={isSubmitted}
                  placeholder="-"
                  className={inputBase}
                />
              </label>
            </div>
            <div>
              <p className="text-[11px] text-ink-4 mb-1.5">약한 영역 (해당 모두 체크)</p>
              <div className="flex flex-wrap gap-1.5">
                {SW_WEAK_AREA_OPTIONS.map((area) => {
                  const checked = s.weakAreas.includes(area);
                  return (
                    <label
                      key={area}
                      className={`cursor-pointer inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] ${
                        checked ? "border-ink bg-ink text-white" : "border-line text-ink-3 hover:border-line-strong"
                      } ${isSubmitted ? "pointer-events-none opacity-50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleWeakArea(i, area)}
                        disabled={isSubmitted}
                        className="sr-only"
                      />
                      {area}
                    </label>
                  );
                })}
              </div>
              {s.weakAreas.includes("기타") && (
                <input
                  type="text"
                  value={s.weakAreaOther ?? ""}
                  onChange={(e) => updateSubject(i, { weakAreaOther: e.target.value })}
                  disabled={isSubmitted}
                  placeholder="기타 약한 영역 직접 입력"
                  className={`${inputBase} mt-2`}
                />
              )}
            </div>
            <input
              type="text"
              value={s.reason}
              onChange={(e) => updateSubject(i, { reason: e.target.value })}
              disabled={isSubmitted}
              placeholder="사유 (1줄 — 예: 개념 정리 부족 / 기출 분석 안 함)"
              className={inputBase}
            />
          </div>
        ))}
        {!isSubmitted && (
          <button
            type="button"
            onClick={addSubject}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-line px-3 py-1.5 text-[11.5px] text-ink-3 hover:border-line-strong hover:text-ink"
          >
            <Plus className="h-3 w-3" />
            과목 추가
          </button>
        )}
      </section>

      {/* 2. 학습 습관 */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Brain className="h-3.5 w-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink">학습 습관</h3>
          <span className="text-[10.5px] text-ink-5">(해당 모두 체크)</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SW_HABIT_OPTIONS.map((h) => {
            const checked = value.studyHabits.includes(h);
            return (
              <label
                key={h}
                className={`cursor-pointer inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-[12px] ${
                  checked ? "border-ink bg-ink text-white" : "border-line text-ink-3 hover:border-line-strong"
                } ${isSubmitted ? "pointer-events-none opacity-50" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleHabit(h)}
                  disabled={isSubmitted}
                  className="sr-only"
                />
                {h}
              </label>
            );
          })}
        </div>
      </section>

      {/* 3. 집중 가능 시간 */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Timer className="h-3.5 w-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink">평균 집중 가능 시간</h3>
          <span className="text-[10.5px] text-ink-5">(분)</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={300}
            step={5}
            value={value.focusMinutes}
            onChange={(e) => setValue((v) => ({ ...v, focusMinutes: e.target.value }))}
            disabled={isSubmitted}
            placeholder="예: 45"
            className={`${inputBase} w-32`}
          />
          <span className="text-[12px] text-ink-4">분</span>
        </div>
      </section>

      {/* 4. 시험 불안도 */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink">시험 불안도</h3>
          <span className="text-[10.5px] text-ink-5">(1=낮음, 5=높음)</span>
        </div>
        <ScaleRow
          value={value.testAnxiety}
          onChange={(n) => setValue((v) => ({ ...v, testAnxiety: n }))}
          disabled={isSubmitted}
          leftLabel="낮음"
          rightLabel="높음"
        />
      </section>

      {/* 5. 자기주도 수준 */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Compass className="h-3.5 w-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink">자기주도 수준</h3>
          <span className="text-[10.5px] text-ink-5">(1=관리 필요, 5=완전 자기주도)</span>
        </div>
        <ScaleRow
          value={value.selfDirection}
          onChange={(n) => setValue((v) => ({ ...v, selfDirection: n }))}
          disabled={isSubmitted}
          leftLabel="관리 필요"
          rightLabel="완전 자기주도"
        />
      </section>
    </div>
  );
}

function ScaleRow({
  value,
  onChange,
  disabled,
  leftLabel,
  rightLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled: boolean;
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10.5px] text-ink-5">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              disabled={disabled}
              className={`h-9 w-9 rounded-md border text-[13px] font-semibold tabular-nums ${
                active ? "border-ink bg-ink text-white" : "border-line text-ink-3 hover:border-line-strong"
              } disabled:opacity-50`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
