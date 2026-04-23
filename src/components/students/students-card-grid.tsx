"use client";

import Link from "next/link";
import { MemberCard } from "@/components/ui/member-card";
import type { Student, User } from "@/generated/prisma";

type StudentLike = Student & {
  mentor: Pick<User, "name"> | null;
};

const STATUS_PILL: Record<string, { tone: "ok" | "warn" | "bad" | "info" | "neutral"; label: string }> = {
  ACTIVE:    { tone: "ok",   label: "재원" },
  INACTIVE:  { tone: "warn", label: "휴원" },
  GRADUATED: { tone: "info", label: "졸업" },
  WITHDRAWN: { tone: "bad",  label: "퇴원" },
};

interface StudentsCardGridProps {
  students: StudentLike[];
}

function joinDateLabel(d: Date | null | undefined): string {
  if (!d) return "—";
  const v = new Date(d);
  return `${v.getFullYear()}.${String(v.getMonth() + 1).padStart(2, "0")}.${String(v.getDate()).padStart(2, "0")}`;
}

export function StudentsCardGrid({ students }: StudentsCardGridProps) {
  if (students.length === 0) {
    return (
      <div className="py-16 text-center text-[13px] text-ink-4">
        표시할 원생이 없습니다
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[14px]">
      {students.map((s) => {
        const pill = STATUS_PILL[s.status] ?? STATUS_PILL.ACTIVE;
        return (
          <Link key={s.id} href={`/students/${s.id}`}>
            <MemberCard
              name={s.name}
              role={s.grade ? `${s.grade} · ${s.mentor?.name ?? "미배정"}` : s.mentor?.name ?? "미배정"}
              pill={pill}
              meta={[
                { label: "좌석", value: s.seat ?? "—" },
                { label: "등록일", value: joinDateLabel(s.createdAt) },
              ]}
              email={s.parentEmail ?? undefined}
              phone={s.phone ?? s.parentPhone ?? undefined}
            />
          </Link>
        );
      })}
    </div>
  );
}
