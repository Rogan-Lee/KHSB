import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { NewConsultationForm } from "@/components/consultations/new-consultation-form";

export default async function NewConsultationPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const { owner: ownerParam } = await searchParams;
  const owner = ownerParam === "HEAD_TEACHER" ? "HEAD_TEACHER" : "DIRECTOR";

  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, grade: true },
    orderBy: { name: "asc" },
  });

  return <NewConsultationForm students={students} owner={owner} />;
}
