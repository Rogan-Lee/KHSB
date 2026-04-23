export const revalidate = 30;

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CardNewsClient } from "@/components/card-news/card-news-client";

export default async function CardNewsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "DIRECTOR" && session.user.role !== "SUPER_ADMIN") {
    redirect("/");
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">카드뉴스 생성</h2>
        <p className="text-sm text-muted-foreground mt-0.5">AI가 소재를 분석해 인스타그램용 카드뉴스를 자동 생성합니다.</p>
      </div>
      <CardNewsClient />
    </div>
  );
}
