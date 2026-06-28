import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import {
  createMobileHandover,
  getMobileHandovers,
} from "@/lib/mobile-operations";

export async function GET(request: NextRequest) {
  try {
    const user = await requireMobileStaff(request);
    return mobileJson(await getMobileHandovers(user.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const [user, body] = await Promise.all([
      requireMobileStaff(request),
      request.json(),
    ]);
    const handover = await createMobileHandover(
      { id: user.id, name: user.name },
      body,
    );
    revalidatePath("/");
    revalidatePath("/handover");
    return mobileJson(handover);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
