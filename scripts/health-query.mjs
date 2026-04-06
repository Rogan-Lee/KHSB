import { neon, neonConfig } from "@neondatabase/serverless";

const DATABASE_URL =
  "postgresql://neondb_owner:npg_FXZf4GRiNh2s@ep-frosty-night-a1240d6o-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

neonConfig.poolQueryViaFetch = true;
const sql = neon(DATABASE_URL);

async function runQueries() {
  const results = {};

  // Q1: Student counts
  const q1 = await sql`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'ACTIVE') as active FROM "Student"`;
  results.students = q1[0];

  // Q2: Attendance this week
  const q2 = await sql`SELECT COUNT(*) as total_records, COUNT("checkIn") as checked_in, COUNT("checkOut") as checked_out FROM "AttendanceRecord" WHERE date >= CURRENT_DATE - INTERVAL '7 days'`;
  results.attendance = q2[0];

  // Q3: Mentoring completion
  const q3 = await sql`SELECT status, COUNT(*) FROM "Mentoring" WHERE "scheduledAt" >= CURRENT_DATE - INTERVAL '7 days' GROUP BY status`;
  results.mentoring = q3;

  // Q4: Messages sent
  const q4 = await sql`SELECT type, status, COUNT(*) FROM "MessageLog" WHERE "createdAt" >= CURRENT_DATE - INTERVAL '7 days' GROUP BY type, status`;
  results.messages = q4;

  // Q5: Feature requests
  const q5 = await sql`SELECT status, COUNT(*) FROM "FeatureRequest" GROUP BY status`;
  results.featureRequests = q5;

  // Q6: New students this week
  const q6 = await sql`SELECT COUNT(*) FROM "Student" WHERE "createdAt" >= CURRENT_DATE - INTERVAL '7 days'`;
  results.newStudents = q6[0];

  // Q7: Parent reports
  const q7 = await sql`SELECT COUNT(*) FROM "ParentReport" WHERE "createdAt" >= CURRENT_DATE - INTERVAL '7 days'`;
  results.parentReports = q7[0];

  // Q8: Consultations
  const q8 = await sql`SELECT status, COUNT(*) FROM "DirectorConsultation" WHERE "createdAt" >= CURRENT_DATE - INTERVAL '7 days' GROUP BY status`;
  results.consultations = q8;

  console.log(JSON.stringify(results, null, 2));
}

runQueries().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
