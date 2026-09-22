import type { NetworkRequestKind } from "@/generated/prisma/enums";

export const NETWORK_KIND_LABELS: Record<NetworkRequestKind, string> = {
  WIFI_UNBLOCK: "와이파이 해제",
  DOMAIN_ALLOW: "사이트 허용",
  APP_UNBLOCK: "앱 사용",
};

export const NETWORK_KIND_ORDER: NetworkRequestKind[] = [
  "WIFI_UNBLOCK",
  "DOMAIN_ALLOW",
  "APP_UNBLOCK",
];
