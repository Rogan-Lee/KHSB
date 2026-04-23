import { redirect } from "next/navigation";
import { validateMagicLink } from "@/lib/student-auth";

export default async function StudentPortalLayout({
  children,
  params,
}: LayoutProps<"/s/[token]">) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto max-w-[720px] px-4 py-3 flex items-center justify-between">
          <h1 className="text-[14px] font-semibold text-ink tracking-[-0.01em]">
            {session.student.name} 학생 전용
          </h1>
          <span className="text-[11px] text-ink-4 tabular-nums">
            만료: {session.link.expiresAt.toLocaleDateString("ko-KR")}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-[720px] px-4 py-5">{children}</main>
    </div>
  );
}
