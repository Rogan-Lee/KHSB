import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client.js";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const pending = await prisma.featureRequest.findMany({
    where: { status: "PENDING" },
    select: {
      id: true,
      title: true,
      category: true,
      priority: true,
      relatedPage: true,
      description: true,
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    take: 3,
  });

  console.log(`Pending requests: ${pending.length}`);
  console.log(JSON.stringify(pending, null, 2));
  await prisma.$disconnect();
}

main();
