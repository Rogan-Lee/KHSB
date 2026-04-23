import { redirect } from "next/navigation";
import Link from "next/link";
import { validateMagicLink } from "@/lib/student-auth";
import { FileText, ClipboardCheck, MessageSquare } from "lucide-react";

export default async function StudentPortalHomePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const { student } = session;
  const daysLeft = Math.max(
    0,
    Math.ceil((session.link.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );

  return (
    <div className="space-y-4">
      <section className="rounded-[12px] border border-line bg-panel p-4">
        <h2 className="text-[14px] font-semibold text-ink">
          안녕하세요, {student.name}님
        </h2>
        <p className="mt-1 text-[12px] text-ink-4 leading-relaxed">
          본인 전용 포털입니다. 컨설턴트·관리멘토가 배정한 과제와 일정을 확인할 수 있어요.
        </p>
        <p className="mt-2 text-[11px] text-ink-5">
          이 링크는 외부 공유 시 타인이 본인 정보에 접근할 수 있으니 관리에 주의하세요.
          만료까지 {daysLeft}일.
        </p>
      </section>

      <section className="space-y-2">
        <PortalLink
          href={`/s/${token}/survey`}
          icon={<FileText className="h-4 w-4 text-ink-3" />}
          label="초기 설문"
          hint="Sprint 2 오픈 예정"
          disabled
        />
        <PortalLink
          href={`/s/${token}/tasks`}
          icon={<ClipboardCheck className="h-4 w-4 text-ink-3" />}
          label="수행평가 일정"
          hint="Sprint 2 오픈 예정"
          disabled
        />
        <PortalLink
          href={`/s/${token}/feedback`}
          icon={<MessageSquare className="h-4 w-4 text-ink-3" />}
          label="받은 피드백"
          hint="Sprint 2 오픈 예정"
          disabled
        />
      </section>
    </div>
  );
}

function PortalLink({
  href,
  icon,
  label,
  hint,
  disabled,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  const body = (
    <div className="flex items-center gap-3 rounded-[10px] border border-line bg-panel px-3 py-2.5 hover:border-line-strong transition-colors">
      {icon}
      <span className="flex-1 text-[13px] font-medium text-ink">{label}</span>
      {hint && <span className="text-[11px] text-ink-5">{hint}</span>}
    </div>
  );

  if (disabled) {
    return (
      <div className="opacity-60 cursor-not-allowed" aria-disabled="true">
        {body}
      </div>
    );
  }
  return <Link href={href}>{body}</Link>;
}
