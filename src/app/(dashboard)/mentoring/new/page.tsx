import { getUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { NewMentoringForm } from "@/components/mentoring/new-mentoring-form";

export default async function NewMentoringPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  if (!user.orgId) return null;
  const orgId = user.orgId;

  const students = await prisma.student.findMany({
    where: { orgId, status: "ACTIVE" },
    select: { id: true, name: true, grade: true, school: true },
    orderBy: { name: "asc" },
  });

  return <NewMentoringForm students={students} />;
}
