import { NextRequest } from "next/server";

import { getAuthIdentity } from "@/lib/auth";

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
    });
  }

  return Response.json({ error: "연결된 계정이 없습니다" }, { status: 403 });
}
