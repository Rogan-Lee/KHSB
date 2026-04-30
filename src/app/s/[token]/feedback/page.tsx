import { redirect } from "next/navigation";
import Link from "next/link";
import { MessageCircle, Sparkles, ArrowRight } from "lucide-react";
import { validateMagicLink } from "@/lib/student-auth";

export default async function StudentFeedbackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  return (
    <div className="space-y-4">
      <section className="rounded-[18px] bg-gradient-to-br from-info to-info-ink p-5 text-white shadow-md">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
          <MessageCircle className="h-5 w-5" strokeWidth={2.5} />
        </div>
        <h2 className="mt-3 text-[20px] font-bold tracking-[-0.02em]">
          피드백 모음
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed opacity-95">
          컨설턴트·관리멘토가 남긴 피드백을 한 곳에서 모아 보는 기능이에요.
          현재는 각 수행평가 상세 화면에서 확인할 수 있어요.
        </p>
      </section>

      <section className="rounded-[14px] border border-line bg-panel p-5 text-center">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-canvas-2 text-ink-4">
          <Sparkles className="h-5 w-5" />
        </span>
        <p className="mt-3 text-[14px] font-semibold text-ink">
          준비 중인 기능이에요
        </p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-4">
          Sprint 2에서 받은 피드백 타임라인을 추가할 예정이에요. 그 전까지는
          수행평가 상세에서 피드백을 확인할 수 있어요.
        </p>
        <Link
          href={`/s/${token}/tasks`}
          className="mt-4 inline-flex items-center gap-1.5 rounded-[10px] border border-line bg-canvas px-3.5 py-2 text-[12.5px] font-semibold text-ink-2 active:bg-canvas-2"
        >
          수행평가 보러 가기
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </section>
    </div>
  );
}
