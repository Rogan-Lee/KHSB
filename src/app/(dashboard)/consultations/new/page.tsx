import { prisma } from "@/lib/prisma";
import { NewConsultationForm } from "@/components/consultations/new-consultation-form";
import { requireDashboardSession } from "../../_lib/page-guard";

export default async function NewConsultationPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string }>;
}) {
  await requireDashboardSession();

  const { owner: ownerParam } = await searchParams;
  const owner = ownerParam === "HEAD_TEACHER" ? "HEAD_TEACHER" : "DIRECTOR";

  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, grade: true },
    orderBy: { name: "asc" },
  });

  return <NewConsultationForm students={students} owner={owner} />;
}
