import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";

const PAGE_TITLES: Record<string, string> = {
  "/": "대시보드",
  "/students": "원생 관리",
  "/attendance": "입퇴실 관리",
  "/merit-demerit": "상벌점 관리",
  "/mentoring": "멘토링",
  "/academic-plans": "학업 플래닝",
  "/consultations": "원장 면담",
  "/messages": "카카오 메시지",
  "/reports": "월간 리포트",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar role={session.user.role} />
      <div className="ml-60 flex flex-col min-h-screen">
        <AppHeader
          user={session.user}
          title="독서실 관리 시스템"
        />
        <main className="flex-1 p-6 max-w-[1400px]">
          {children}
        </main>
      </div>
    </div>
  );
}
