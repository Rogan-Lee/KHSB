import Link from "next/link";
import { getUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Users, LinkIcon, ClipboardList } from "lucide-react";
import { ROLE_DISPLAY } from "@/lib/roles";

export default async function OnlineHomePage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  const [onlineStudentCount, activeMagicLinkCount] = await Promise.all([
    prisma.student.count({ where: { isOnlineManaged: true, status: "ACTIVE" } }),
    prisma.studentMagicLink.count({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.015em]">
          온라인 관리
        </h1>
        <p className="mt-1 text-[13px] text-ink-4">
          {user.name} · {ROLE_DISPLAY[user.role] ?? user.role}
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard
          label="온라인 학생"
          value={onlineStudentCount}
          suffix="명"
          icon={<Users className="h-4 w-4 text-ink-3" />}
          href="/online/students"
        />
        <StatCard
          label="활성 매직링크"
          value={activeMagicLinkCount}
          suffix="건"
          icon={<LinkIcon className="h-4 w-4 text-ink-3" />}
          href="/online/students"
        />
        <StatCard
          label="이번 주 할 일"
          value={0}
          suffix="건"
          icon={<ClipboardList className="h-4 w-4 text-ink-3" />}
          hint="Sprint 2 이후 활성화"
        />
      </div>

      <section className="rounded-[12px] border border-line bg-panel p-4">
        <h2 className="text-[13px] font-semibold text-ink">Phase 1 MVP 진행 상황</h2>
        <p className="mt-1 text-[12px] text-ink-4 leading-relaxed">
          현재 Sprint 1 — 기반 구조 구축 단계입니다. 온라인 학생 등록, 매직링크 발급,
          학생 포털(/s/[token]) 기본 기능이 제공됩니다. 컨설팅·관리·학부모 보고서 모듈은
          이후 스프린트에서 순차 도입됩니다.
        </p>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
  icon,
  href,
  hint,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon?: React.ReactNode;
  href?: string;
  hint?: string;
}) {
  const body = (
    <div className="rounded-[12px] border border-line bg-panel p-4 hover:border-line-strong transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-ink-4">{label}</span>
        {icon}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-[24px] font-semibold text-ink tabular-nums">
          {value.toLocaleString()}
        </span>
        {suffix && <span className="text-[12px] text-ink-4">{suffix}</span>}
      </div>
      {hint && <p className="mt-1 text-[11px] text-ink-5">{hint}</p>}
    </div>
  );

  if (href) return <Link href={href}>{body}</Link>;
  return body;
}
