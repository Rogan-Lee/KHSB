"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { ScheduleSlotsEditor, type AttendanceSlot, type OutingSlot } from "@/components/online/schedule-slots-editor";
import { submitScheduleProposal } from "@/actions/online/schedule-proposals";
import { TextField, TextFieldTextarea } from "seed-design/ui/text-field";
import { Badge, Button, IconTile, ListRow, Section } from "@/components/portal/ui";
import { SCHEDULE_PROPOSAL_STATUS } from "@/components/portal/status";

type HistoryRow = { id: string; version: number; status: string; createdAt: string; committedAt: string | null };

/** ISO → KST "9월 24일" (서버·클라이언트 동일 결과) */
function fmtKSTDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

export function ScheduleSubmitPanel({ token, history }: { token: string; history: HistoryRow[] }) {
  const router = useRouter();
  const [attendance, setAttendance] = useState<AttendanceSlot[]>([]);
  const [outings, setOutings] = useState<OutingSlot[]>([]);
  const [memo, setMemo] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (attendance.length === 0) {
      toast.error("등하원 요일을 1개 이상 선택해 주세요");
      return;
    }
    startTransition(async () => {
      try {
        await submitScheduleProposal({ studentToken: token, attendance, outings, memo });
        toast.success("스케줄을 제출했어요. 운영진 검토 후 학부모님께 안내됩니다.");
        setMemo("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "제출 실패");
      }
    });
  }

  return (
    <div className="flex flex-col gap-x3">
      <div className="px-x1 pb-x2 pt-x3">
        <h2 className="t7-bold text-fg-neutral">다음 주 등원 스케줄을 알려주세요</h2>
        <p className="mt-x1_5 t4-regular text-fg-neutral-subtle">
          등하원 시간과 학원·외출 일정을 입력해 주세요. 운영진 확인과 학부모님 승인을 거쳐 입퇴실
          일정에 반영돼요.
        </p>
      </div>

      <Section>
        <ScheduleSlotsEditor
          attendance={attendance}
          outings={outings}
          onAttendanceChange={setAttendance}
          onOutingsChange={setOutings}
          variant="portal"
        />
      </Section>

      <Section>
        <TextField
          label="메모"
          indicator="선택"
          value={memo}
          onValueChange={({ value }) => setMemo(value)}
        >
          <TextFieldTextarea placeholder="특이사항이 있으면 적어 주세요" />
        </TextField>
      </Section>

      <Button variant="primary" size="xl" block loading={pending} onClick={submit}>
        스케줄 제출하기
      </Button>

      {history.length > 0 && (
        <div className="pt-x3">
          <Section title="제출 이력" flush>
            {history.map((h) => {
              const status = SCHEDULE_PROPOSAL_STATUS[h.status] ?? {
                label: h.status,
                tone: "gray" as const,
              };
              return (
                <ListRow
                  key={h.id}
                  leading={<IconTile icon={CalendarClock} tone="gray" />}
                  title={<span className="tabular-nums">{h.version}번째 제출</span>}
                  description={
                    <span className="tabular-nums">
                      {fmtKSTDate(h.createdAt)} 제출
                      {h.committedAt ? ` · ${fmtKSTDate(h.committedAt)} 반영` : ""}
                    </span>
                  }
                  trailing={<Badge tone={status.tone}>{status.label}</Badge>}
                />
              );
            })}
          </Section>
        </div>
      )}
    </div>
  );
}
