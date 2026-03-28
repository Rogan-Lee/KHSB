import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { NewMentoringForm } from "@/components/mentoring/new-mentoring-form";

export default async function NewMentoringPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, grade: true, school: true },
    orderBy: { name: "asc" },
  });

  return <NewMentoringForm students={students} />;
}
