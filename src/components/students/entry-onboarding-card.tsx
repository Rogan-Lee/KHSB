// 원생 상세 — 학생이 앱 "입실 준비"에서 낸 내용 (서버 컴포넌트)

import type { ReactNode } from "react";
import { DescriptionList, Section, StatusBadge } from "@/components/backoffice/ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { proposalStatus } from "@/app/online/schedules/_lib/status";
import type { AttendanceSlot, OutingSlot } from "@/lib/online/schedule-commit";
import { GRADE_SUBJECTS, type EntryOnboardingResponse, type SubjectGrades } from "@/lib/onboarding/entry";
import { DAY_NAMES, formatDate } from "@/lib/utils";

const grade = (scores: SubjectGrades | undefined, subject: (typeof GRADE_SUBJECTS)[number]) => {
  const g = scores?.[subject];
  return g == null ? <span className="text-fg-placeholder">—</span> : `${g}등급`;
};

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-x6">
      <h3 className="mb-x2 t4-bold text-fg-neutral">{title}</h3>
      {children}
    </div>
  );
}

export function EntryOnboardingCard({
  eligible,
  data,
  submitted,
}: {
  eligible: boolean;
  data: EntryOnboardingResponse;
  submitted: { attendance: AttendanceSlot[]; outings: OutingSlot[] } | null;
}) {
  const { schedule, grades, mentor } = data;
  const answers = mentor.answers?.answers;
  // 기존 학생의 예전 등원 스케줄 제출만 있으면 입실 준비로 보지 않는다
  if (!grades && !answers && !(eligible && schedule)) return null;

  const saved = { grades, mentor: mentor.answers };
  const stepItems = data.steps.map((step) => ({
    label: step.label,
    value:
      step.key === "schedule" ? (
        schedule ? (
          <span className="inline-flex items-center gap-x2">
            <StatusBadge tone={proposalStatus(schedule.status).tone}>{proposalStatus(schedule.status).label}</StatusBadge>
            <span className="text-fg-neutral-muted">{formatDate(schedule.submittedAt)} 제출</span>
          </span>
        ) : (
          <span className="text-fg-placeholder">아직 안 냈어요</span>
        )
      ) : saved[step.key] ? (
        `${formatDate(saved[step.key]!.savedAt)} 제출`
      ) : (
        <span className="text-fg-placeholder">아직 안 냈어요</span>
      ),
  }));

  return (
    <Section title="입실 준비" description="학생이 앱에서 낸 내용이에요. 성적은 성적 탭에도 들어가 있어요." className="mb-x6">
      <DescriptionList items={stepItems} cols={2} />

      {grades && (
        <Block title="성적">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>과목</TableHead>
                <TableHead>{grades.mock ? `모의고사 · ${grades.mock.examName}` : "모의고사 (본 적 없음)"}</TableHead>
                <TableHead>{grades.school ? `내신 · ${grades.school.term}` : "내신 (아직 없음)"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {GRADE_SUBJECTS.map((subject) => (
                <TableRow key={subject}>
                  <TableCell>{subject}</TableCell>
                  <TableCell>{grade(grades.mock?.scores, subject)}</TableCell>
                  <TableCell>{grade(grades.school?.scores, subject)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Block>
      )}

      {eligible && submitted && (
        <Block title="등하원·학원 일정 (학생 제출)">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>요일</TableHead>
                <TableHead>등하원</TableHead>
                <TableHead>학원·외출</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5, 6, 0]
                .filter((d) => submitted.attendance.some((a) => a.dayOfWeek === d) || submitted.outings.some((o) => o.dayOfWeek === d))
                .map((d) => (
                  <TableRow key={d}>
                    <TableCell>{DAY_NAMES[d]}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {submitted.attendance
                        .filter((a) => a.dayOfWeek === d)
                        .map((a) => `${a.startTime}~${a.endTime}`)
                        .join(", ") || "—"}
                    </TableCell>
                    <TableCell>
                      {submitted.outings
                        .filter((o) => o.dayOfWeek === d)
                        .map((o) => `${o.outStart}~${o.outEnd}${o.reason ? ` ${o.reason}` : ""}`)
                        .join(", ") || "—"}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </Block>
      )}

      {answers && (
        <Block title="멘토 매칭 설문">
          <DescriptionList
            cols={1}
            items={mentor.questions.map((q) => {
              const a = answers[q.key];
              return {
                label: q.title,
                value: <span className="whitespace-pre-line">{(Array.isArray(a) ? a.join(", ") : a) || "—"}</span>,
              };
            })}
          />
        </Block>
      )}
    </Section>
  );
}
