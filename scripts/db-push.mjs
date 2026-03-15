// db:push를 DIRECT_URL(non-pooler)로 실행 - Neon DDL 작업에 필요
import { config } from "dotenv";
import { spawnSync } from "child_process";

config(); // .env 로드

const directUrl = process.env.DIRECT_URL;
if (!directUrl) {
  console.error("❌ DIRECT_URL이 .env에 없습니다.");
  process.exit(1);
}

console.log("🔗 Direct URL로 db:push 실행 중...");

const result = spawnSync("npx", ["prisma", "db", "push"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: directUrl },
});

process.exit(result.status ?? 1);
