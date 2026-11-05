import fs from "node:fs";
import { db } from "../lib/db";
import { plans } from "../db/schema";
import type { Plan } from "../lib/plan";

const plan = JSON.parse(fs.readFileSync("data/plan.json", "utf8")) as Plan;

async function main() {
  await db
    .insert(plans)
    .values({
      id: plan.plan_id,
      name: plan.name,
      status: plan.status,
      data: plan,
      version: 1,
    })
    .onConflictDoNothing();

  const rows = await db.select({ id: plans.id, version: plans.version }).from(plans);
  console.log("Plans in database:", rows);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
