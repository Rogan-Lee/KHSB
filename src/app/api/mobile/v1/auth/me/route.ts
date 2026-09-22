import { NextRequest } from "next/server";

import { getAuthIdentity } from "@/lib/auth";
import {
  parentCapabilities,
  staffCapabilities,
  studentCapabilities,
} from "@/lib/mobile-capabilities";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const current = await getAuthIdentity(request.headers);
  if (!current) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (current.identity.appUser) {
    const user = current.identity.appUser;
    if (user.status !== "ACTIVE") {
      return Response.json({ error: "비활성 계정입니다" }, { status: 403 });
    }
    return Response.json({
      accountType: "STAFF",
      id: user.id,
      name: user.name,
      role: user.role,
      capabilities: staffCapabilities(user.role),
    });
  }

  if (current.identity.student) {
    const student = current.identity.student;
    if (student.status !== "ACTIVE") {
      return Response.json({ error: "비활성 계정입니다" }, { status: 403 });
    }
    return Response.json({
      accountType: "STUDENT",
      id: student.id,
      isOnlineManaged: student.isOnlineManaged,
      name: student.name,
      role: "STUDENT",
      capabilities: studentCapabilities(student.isOnlineManaged),
    });
  }

  const parentLinks = await prisma.parentLink.findMany({
    where: {
      authUserId: current.identity.id,
      student: { status: "ACTIVE" },
    },
    include: {
      student: { select: { grade: true, id: true, name: true, seat: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (parentLinks.length > 0) {
    return Response.json({
      accountType: "PARENT",
      id: current.identity.id,
      name: current.identity.name,
      role: "PARENT",
      children: parentLinks.map((link) => link.student),
      capabilities: parentCapabilities(),
    });
  }

  return Response.json({ error: "연결된 계정이 없습니다" }, { status: 403 });
}
