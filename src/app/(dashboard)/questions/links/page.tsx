import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Link2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { isFullAccess, isStaff } from "@/lib/roles";
import { listStudentPortalLinks } from "@/actions/student-portal-links";
import { PortalLinksClient } from "./_links-client";

export default async function StudentPortalLinksPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  if (!isStaff(session.user.role)) redirect("/");

  const students = await listStudentPortalLinks();
  const canManage = isFullAccess(session.user.role);
  const withLink = students.filter((s) => s.token).length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <Link
        href="/questions"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        학생 질문 목록
      </Link>
      <div className="mt-3 mb-1 flex items-center gap-2">
        <Link2 className="h-5 w-5 text-brand" />
        <h1 className="text-xl font-bold tracking-tight">학생 포털 링크</h1>
      </div>
      <p className="mb-5 text-sm text-muted-foreground">
        재원생에게 보낼 본인 전용 링크({withLink}/{students.length}명 발급됨). 학생은 이 링크로 질문하고
        멘토 답변을 확인합니다. 링크는 30일 후 만료되며 재발급할 수 있어요.
        {!canManage && " (발급·재발급은 원장 권한 필요)"}
      </p>
      <PortalLinksClient students={students} canManage={canManage} />
    </div>
  );
}
