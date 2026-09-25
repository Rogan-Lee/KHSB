export const revalidate = 30;

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/backoffice/ui";
import { CardNewsClient } from "@/components/card-news/card-news-client";

export default async function CardNewsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "DIRECTOR" && session.user.role !== "SUPER_ADMIN") {
    redirect("/");
  }

  return (
    <>
      <PageHeader title="카드뉴스" description="소재를 입력하면 AI가 인스타그램용 카드뉴스를 만들어요" />
      <CardNewsClient />
    </>
  );
}
