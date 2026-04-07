import { getUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { NewConsultationForm } from "@/components/consultations/new-consultation-form";

export default async function NewConsultationPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  if (!user.orgId) return null;
  const orgId = user.orgId;

  const { owner: ownerParam } = await searchParams;
  const owner = ownerParam === "HEAD_TEACHER" ? "HEAD_TEACHER" : "DIRECTOR";

  const students = await prisma.student.findMany({
    where: { orgId, status: "ACTIVE" },
    select: { id: true, name: true, grade: true },
    orderBy: { name: "asc" },
  });

  return <NewConsultationForm students={students} owner={owner} />;
}
