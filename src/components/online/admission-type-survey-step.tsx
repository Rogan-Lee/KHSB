"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trophy, ListChecks, Target, Briefcase, FileText, Trash2 } from "lucide-react";
import { upsertSurveySection } from "@/actions/online/onboarding-survey";
import {
  ADMISSION_PRIMARY_TRACK_OPTIONS,
  ADMISSION_CSAT_OPTIONS,
  ADMISSION_CARD_TRACK_OPTIONS,
  ADMISSION_CARD_FIT_OPTIONS,
  ALL_INTERNAL_SEMESTERS,
  INTERNAL_SUBJECT_KEYS,
  MOCK_SUBJECT_KEYS,
  classifyInternalSemesters,
  isAdmissionTypeComplete,
  type AdmissionTypeAnswer,
  type AdmissionCard,
  type InternalSubjectKey,
  type MockSubjectKey,
  type InternalSemesterKey,
} from "@/lib/online/survey-template";

const AUTOSAVE_DELAY_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "error";

export function AdmissionTypeSurveyStep({
  studentToken,
  sectionKey,
  initial,
  isSubmitted,
  gradeNumber,
  onValidityChange,
}: {
  studentToken: string;
  sectionKey: string;
  initial: AdmissionTypeAnswer;
  isSubmitted: boolean;
  gradeNumber: 1 | 2 | 3 | null;
  onValidityChange?: (valid: boolean) => void;
}) {
  const [value, setValue] = useState<AdmissionTypeAnswer>(initial);
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
    onValidityChange?.(isAdmissionTypeComplete(value, gradeNumber));
  }, [value, gradeNumber, onValidityChange]);

  const semesterClassification = useMemo(
    () => classifyInternalSemesters(gradeNumber),
    [gradeNumber],
  );

  const visibleSemesters = semesterClassification.filter((c) => c.status !== "future");
  const semesterStatus = new Map(semesterClassification.map((c) => [c.semester, c.status]));

  function setSemesterGrade(sem: InternalSemesterKey, subject: InternalSubjectKey, val: string) {
    setValue((v) => ({
      ...v,
      internalGrades: v.internalGrades.map((g) =>
        g.semester === sem ? { ...g, grades: { ...g.grades, [subject]: val } } : g,
      ),
    }));
  }
  function toggleSemesterUnregistered(sem: InternalSemesterKey) {
    setValue((v) => ({
      ...v,
      internalGrades: v.internalGrades.map((g) =>
        g.semester === sem ? { ...g, unregistered: !g.unregistered } : g,
      ),
    }));
  }

  function setMock(idx: number, patch: Partial<{ label: string; unregistered: boolean }>) {
    setValue((v) => ({
      ...v,
      mockGrades: v.mockGrades.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    }));
  }
  function setMockGrade(idx: number, subject: MockSubjectKey, val: string) {
    setValue((v) => ({
      ...v,
      mockGrades: v.mockGrades.map((m, i) =>
        i === idx ? { ...m, grades: { ...m.grades, [subject]: val } } : m,
      ),
    }));
  }
  function setMockPercentile(idx: number, subject: MockSubjectKey, val: string) {
    setValue((v) => ({
      ...v,
      mockGrades: v.mockGrades.map((m, i) =>
        i === idx ? { ...m, percentiles: { ...m.percentiles, [subject]: val } } : m,
      ),
    }));
  }

  function setCard(idx: number, patch: Partial<AdmissionCard>) {
    setValue((v) => ({
      ...v,
      cardStrategy: v.cardStrategy.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  }

  const isJeongsiOnly = value.primaryTrack === "정시 단일";

  const inputBase =
    "w-full rounded-[8px] border border-line bg-canvas px-3 py-2 text-[12.5px] text-ink focus:outline-none focus:border-line-strong disabled:opacity-60";
  const cellBase =
    "w-full rounded-[6px] border border-line bg-canvas px-1.5 py-1 text-[12px] text-center tabular-nums focus:outline-none focus:border-line-strong disabled:opacity-60";

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

      {/* 1. 주력 전형 */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-3.5 w-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink">주력 전형</h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ADMISSION_PRIMARY_TRACK_OPTIONS.map((opt) => {
            const checked = value.primaryTrack === opt.value;
            return (
              <label
                key={opt.value}
                className={`cursor-pointer inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-[12px] ${
                  checked ? "border-ink bg-ink text-white" : "border-line text-ink-3 hover:border-line-strong"
                } ${isSubmitted ? "pointer-events-none opacity-50" : ""}`}
              >
                <input
                  type="radio"
                  name="primaryTrack"
                  checked={checked}
                  onChange={() => setValue((v) => ({ ...v, primaryTrack: opt.value }))}
                  disabled={isSubmitted}
                  className="sr-only"
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      </section>

      {/* 2. 내신 등급 */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <ListChecks className="h-3.5 w-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink">내신 등급</h3>
          <span className="text-[10.5px] text-ink-5">
            {gradeNumber ? `(고${gradeNumber} 기준 — 진행 학기만 노출)` : "(학년 미상 — 5학기 모두 노출)"}
          </span>
        </div>
        <div className="overflow-x-auto rounded-[10px] border border-line bg-panel">
          <table className="w-full text-[12px]">
            <thead className="bg-canvas-2 text-ink-4">
              <tr>
                <th className="px-2 py-2 text-left font-semibold">학기</th>
                {INTERNAL_SUBJECT_KEYS.map((k) => (
                  <th key={k} className="px-1 py-2 font-semibold text-center">
                    {k}
                  </th>
                ))}
                <th className="px-2 py-2 text-center font-semibold">미등록</th>
              </tr>
            </thead>
            <tbody>
              {visibleSemesters.map(({ semester, status }) => {
                const row = value.internalGrades.find((g) => g.semester === semester);
                if (!row) return null;
                return (
                  <tr key={semester} className="border-t border-line">
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold">{semester}</span>
                        {status === "ongoing" && (
                          <span className="rounded bg-amber-100 text-amber-700 text-[10px] px-1 py-0.5">
                            진행 중
                          </span>
                        )}
                      </div>
                    </td>
                    {INTERNAL_SUBJECT_KEYS.map((k) => (
                      <td key={k} className="px-1 py-1.5">
                        <input
                          type="number"
                          step={0.1}
                          min={1}
                          max={9}
                          value={row.grades[k]}
                          onChange={(e) => setSemesterGrade(semester, k, e.target.value)}
                          disabled={isSubmitted || row.unregistered}
                          placeholder="-"
                          className={cellBase}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={row.unregistered}
                        onChange={() => toggleSemesterUnregistered(semester)}
                        disabled={isSubmitted}
                        className="h-3.5 w-3.5"
                        title="미등록 (이번 학기 미응답)"
                      />
                    </td>
                  </tr>
                );
              })}
              {ALL_INTERNAL_SEMESTERS.filter((s) => semesterStatus.get(s) === "future").length > 0 && (
                <tr className="border-t border-line bg-canvas-2/50">
                  <td colSpan={INTERNAL_SUBJECT_KEYS.length + 2} className="px-2 py-1.5 text-[11px] text-ink-4 text-center">
                    아직 진행하지 않은 학기는 노출되지 않습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. 모의고사 등급 (최근 3회) */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink">모의고사 등급 (최근 3회)</h3>
          <span className="text-[10.5px] text-ink-5">(회차 라벨 자유 입력 — 예: "9월 모평")</span>
        </div>
        <div className="space-y-2">
          {value.mockGrades.map((m, i) => (
            <div key={i} className="rounded-[10px] border border-line bg-panel p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-ink-4 shrink-0">{i + 1}회차</span>
                <input
                  type="text"
                  value={m.label}
                  onChange={(e) => setMock(i, { label: e.target.value })}
                  disabled={isSubmitted || m.unregistered}
                  placeholder="회차 (예: 9월 모평)"
                  className={`${inputBase} flex-1`}
                />
                <label className="text-[11px] text-ink-4 inline-flex items-center gap-1 shrink-0">
                  <input
                    type="checkbox"
                    checked={m.unregistered}
                    onChange={() => setMock(i, { unregistered: !m.unregistered })}
                    disabled={isSubmitted}
                    className="h-3 w-3"
                  />
                  미등록
                </label>
              </div>
              {!m.unregistered && (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead className="text-ink-5">
                      <tr>
                        <th className="px-1 py-1 text-left font-semibold">항목</th>
                        {MOCK_SUBJECT_KEYS.map((k) => (
                          <th key={k} className="px-1 py-1 text-center font-semibold">
                            {k}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="px-1 py-1 text-ink-3">등급</td>
                        {MOCK_SUBJECT_KEYS.map((k) => (
                          <td key={k} className="px-1 py-1">
                            <input
                              type="number"
                              step={1}
                              min={1}
                              max={9}
                              value={m.grades[k]}
                              onChange={(e) => setMockGrade(i, k, e.target.value)}
                              disabled={isSubmitted}
                              placeholder="-"
                              className={cellBase}
                            />
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-1 py-1 text-ink-3">백분위</td>
                        {MOCK_SUBJECT_KEYS.map((k) => (
                          <td key={k} className="px-1 py-1">
                            <input
                              type="number"
                              step={1}
                              min={0}
                              max={100}
                              value={m.percentiles[k]}
                              onChange={(e) => setMockPercentile(i, k, e.target.value)}
                              disabled={isSubmitted}
                              placeholder="-"
                              className={cellBase}
                            />
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 4. 수능 최저 */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Briefcase className="h-3.5 w-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink">수능 최저 충족 자신감</h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ADMISSION_CSAT_OPTIONS.map((opt) => {
            const checked = value.csatMinimum === opt.value;
            return (
              <label
                key={opt.value}
                className={`cursor-pointer inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-[12px] ${
                  checked ? "border-ink bg-ink text-white" : "border-line text-ink-3 hover:border-line-strong"
                } ${isSubmitted ? "pointer-events-none opacity-50" : ""}`}
              >
                <input
                  type="radio"
                  name="csatMinimum"
                  checked={checked}
                  onChange={() => setValue((v) => ({ ...v, csatMinimum: opt.value }))}
                  disabled={isSubmitted}
                  className="sr-only"
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      </section>

      {/* 5. 수시 카드 6장 */}
      {!isJeongsiOnly && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Trophy className="h-3.5 w-3.5 text-ink-3" />
            <h3 className="text-[13px] font-semibold text-ink">수시 카드 전략 (6장)</h3>
            <span className="text-[10.5px] text-ink-5">(셀별 미정 허용 — 비워둬도 됨)</span>
          </div>
          {value.cardStrategy.map((c, i) => (
            <div key={i} className="rounded-[10px] border border-line bg-panel p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-ink text-white text-[11px] font-semibold px-2 py-0.5">
                  카드 {i + 1}
                </span>
                {(c.university || c.department || c.track || c.fit) && !isSubmitted && (
                  <button
                    type="button"
                    onClick={() => setCard(i, { university: "", department: "", track: "", fit: "" })}
                    className="ml-auto text-ink-5 hover:text-red-600"
                    title="비우기"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={c.university}
                  onChange={(e) => setCard(i, { university: e.target.value })}
                  disabled={isSubmitted}
                  placeholder="대학"
                  className={inputBase}
                />
                <input
                  type="text"
                  value={c.department}
                  onChange={(e) => setCard(i, { department: e.target.value })}
                  disabled={isSubmitted}
                  placeholder="학과"
                  className={inputBase}
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ADMISSION_CARD_TRACK_OPTIONS.map((t) => {
                  const checked = c.track === t.value;
                  return (
                    <label
                      key={t.value}
                      className={`cursor-pointer inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] ${
                        checked ? "border-ink bg-ink text-white" : "border-line text-ink-3 hover:border-line-strong"
                      } ${isSubmitted ? "pointer-events-none opacity-50" : ""}`}
                    >
                      <input
                        type="radio"
                        name={`card-track-${i}`}
                        checked={checked}
                        onChange={() => setCard(i, { track: t.value })}
                        disabled={isSubmitted}
                        className="sr-only"
                      />
                      {t.label}
                    </label>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ADMISSION_CARD_FIT_OPTIONS.map((f) => {
                  const checked = c.fit === f.value;
                  return (
                    <label
                      key={f.value}
                      className={`cursor-pointer inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] ${
                        checked ? "border-ink bg-ink text-white" : "border-line text-ink-3 hover:border-line-strong"
                      } ${isSubmitted ? "pointer-events-none opacity-50" : ""}`}
                    >
                      <input
                        type="radio"
                        name={`card-fit-${i}`}
                        checked={checked}
                        onChange={() => setCard(i, { fit: f.value })}
                        disabled={isSubmitted}
                        className="sr-only"
                      />
                      {f.label}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* 6. 판단 근거 */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink">판단 근거</h3>
        </div>
        <textarea
          value={value.rationale}
          onChange={(e) => setValue((v) => ({ ...v, rationale: e.target.value }))}
          disabled={isSubmitted}
          placeholder="현재 내신·모의 등급, 생기부 강점·약점, 수능 최저 등을 종합한 판단 근거 (2-3줄)"
          rows={3}
          className={`${inputBase} resize-y`}
        />
      </section>
    </div>
  );
}
