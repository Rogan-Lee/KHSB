"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/backoffice/ui";
import type { Student, User } from "@/generated/prisma";
import { STUDENT_STATUS } from "./student-status";
import { StudentAvatar } from "./student-avatar";

type StudentLike = Student & {
  mentor: Pick<User, "name"> | null;
};

interface StudentsCardGridProps {
  students: StudentLike[];
}

function joinDateLabel(d: Date | null | undefined): string {
  if (!d) return "—";
  const v = new Date(d);
  return `${v.getFullYear()}.${String(v.getMonth() + 1).padStart(2, "0")}.${String(v.getDate()).padStart(2, "0")}`;
}

/** 카드 보기 — 목록과 같은 필터 결과를 받는다(빈 상태는 상위 StudentsListView 가 처리) */
export function StudentsCardGrid({ students }: StudentsCardGridProps) {
  return (
    <div className="grid grid-cols-1 gap-x3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {students.map((s) => {
        const status = STUDENT_STATUS[s.status] ?? STUDENT_STATUS.ACTIVE;
        const role = s.grade ? `${s.grade} · ${s.mentor?.name ?? "미배정"}` : s.mentor?.name ?? "미배정";
        const email = s.parentEmail ?? undefined;
        const phone = s.phone ?? s.parentPhone ?? undefined;
        return (
          <Link
            key={s.id}
            href={`/students/${s.id}`}
            className="group flex flex-col rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default p-x5 transition-colors hover:bg-bg-layer-default-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring"
          >
            <div className="flex items-start justify-between gap-x2">
              <StudentAvatar name={s.name} imageUrl={s.imageUrl} size={40} />
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            </div>

            <p className="mt-x3 truncate t5-bold text-fg-neutral">{s.name}</p>
            <p className="mt-x0_5 truncate t3-regular text-fg-neutral-muted">{role}</p>

            <dl className="mt-x4 grid grid-cols-2 gap-x3 border-t border-stroke-neutral-muted pt-x3">
              <div className="min-w-0">
                <dt className="t2-medium text-fg-neutral-subtle">좌석</dt>
                <dd className="mt-x0_5 truncate t3-medium text-fg-neutral tabular-nums">{s.seat ?? "—"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="t2-medium text-fg-neutral-subtle">등록일</dt>
                <dd className="mt-x0_5 truncate t3-medium text-fg-neutral tabular-nums">{joinDateLabel(s.createdAt)}</dd>
              </div>
            </dl>

            {(email || phone) && (
              <div className="mt-x3 flex items-center gap-x2 border-t border-stroke-neutral-muted pt-x3">
                <div className="min-w-0 flex-1">
                  {email && <p className="truncate t3-medium text-fg-neutral-muted">{email}</p>}
                  {phone && <p className="mt-x0_5 truncate t3-regular text-fg-neutral-subtle tabular-nums">{phone}</p>}
                </div>
                <ChevronRight
                  className="size-4 shrink-0 text-fg-placeholder transition-colors group-hover:text-fg-neutral-muted"
                  aria-hidden
                />
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}
