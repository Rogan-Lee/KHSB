CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID');
CREATE TYPE "PushNotificationCategory" AS ENUM ('TASK', 'QUESTION', 'MENTORING', 'SYSTEM');
CREATE TYPE "PushNotificationStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

CREATE TABLE "DevicePushToken" (
    "id" TEXT NOT NULL,
    "authUserId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "deviceName" TEXT,
    "appVersion" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "tasksEnabled" BOOLEAN NOT NULL DEFAULT true,
    "questionsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mentoringEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DevicePushToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PushNotificationReceipt" (
    "id" TEXT NOT NULL,
    "expoReceiptId" TEXT NOT NULL,
    "devicePushTokenId" TEXT NOT NULL,
    "category" "PushNotificationCategory" NOT NULL,
    "status" "PushNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PushNotificationReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DevicePushToken_token_key" ON "DevicePushToken"("token");
CREATE INDEX "DevicePushToken_authUserId_enabled_idx" ON "DevicePushToken"("authUserId", "enabled");
CREATE INDEX "DevicePushToken_enabled_lastSeenAt_idx" ON "DevicePushToken"("enabled", "lastSeenAt");
CREATE UNIQUE INDEX "PushNotificationReceipt_expoReceiptId_key" ON "PushNotificationReceipt"("expoReceiptId");
CREATE INDEX "PushNotificationReceipt_status_createdAt_idx" ON "PushNotificationReceipt"("status", "createdAt");
CREATE INDEX "PushNotificationReceipt_devicePushTokenId_createdAt_idx" ON "PushNotificationReceipt"("devicePushTokenId", "createdAt");

ALTER TABLE "DevicePushToken" ADD CONSTRAINT "DevicePushToken_authUserId_fkey"
FOREIGN KEY ("authUserId") REFERENCES "AuthUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PushNotificationReceipt" ADD CONSTRAINT "PushNotificationReceipt_devicePushTokenId_fkey"
FOREIGN KEY ("devicePushTokenId") REFERENCES "DevicePushToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
