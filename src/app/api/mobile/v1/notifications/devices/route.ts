import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileAccount,
} from "@/lib/mobile-auth";
import {
  deactivateMobilePushToken,
  registerMobilePushToken,
} from "@/lib/mobile-push";

export async function POST(request: NextRequest) {
  try {
    const [account, body] = await Promise.all([
      requireMobileAccount(request),
      request.json(),
    ]);
    return mobileJson(
      await registerMobilePushToken(account.authUserId, body),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const [account, body] = await Promise.all([
      requireMobileAccount(request),
      request.json(),
    ]);
    return mobileJson(
      await deactivateMobilePushToken(account.authUserId, body),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
