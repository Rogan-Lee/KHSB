import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { NewConsultationForm } from "@/components/consultations/new-consultation-form";

export default async function NewConsultationPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, grade: true },
    orderBy: { name: "asc" },
  });

  return <NewConsultationForm students={students} />;
}
