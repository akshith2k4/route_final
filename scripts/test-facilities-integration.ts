import assert from "node:assert/strict";
import { db } from "../lib/db";
import { hotels } from "../db/schema";
import { getPlanById } from "../lib/plan-store";
import {
  createFacility,
  deleteFacility,
  getFacilityAdminItems,
  updateFacility,
  FacilityConflictError,
} from "../lib/facilities";

async function main() {
  console.log("Starting Facilities Integration Tests...\n");

  // 1. Existing plan regression
  console.log("Checking existing plan regression...");
  const manualCurrent = await getPlanById("manual-current");
  assert.ok(manualCurrent, "manual-current plan must exist in DB");
  assert.equal(manualCurrent.plan.routes.length, 8, "manual-current baseline has 8 routes");

  const shabariPlan = await getPlanById("plan-1cc0cd9f-8a94-42bd-96a8-44ddc50564ea");
  if (shabariPlan) {
    const route2 = shabariPlan.plan.routes.find((r) => r.route_id === "103602");
    assert.ok(route2, "Route 2 - Jayanagara must exist in Shabari first plan");
    assert.equal(route2.vehicle_id, "vehicle-9", "Route 2 Jayanagara must remain vehicle-9");
    console.log("  Shabari first: Route 2 Jayanagara has vehicle-9.");
  }

  const hotelRows = await db.select().from(hotels);
  assert.equal(hotelRows.length, 102, "expected exactly 102 hotels in DB");
  console.log("  102 hotels intact in DB.");

  // 2. Master merge verification
  console.log("\nChecking master merge rules...");
  assert.ok(manualCurrent.plan.depot, "Plan must have a primary depot");
  assert.ok(
    manualCurrent.plan.depots && manualCurrent.plan.depots.length >= 2,
    "Plan depots must contain master warehouses",
  );
  assert.ok(
    manualCurrent.plan.laundries && manualCurrent.plan.laundries.length >= 2,
    "Plan laundries must contain master laundries",
  );

  const hqDepot = manualCurrent.plan.depots.find(
    (d) => d.id === "depot-yeshwanthpur",
  );
  assert.ok(hqDepot, "HQ depot must be present in depots list");
  assert.equal(hqDepot.short_name, "HQ");

  // Test adding a dynamic master facility -> must appear in plan depots on merge
  console.log("\nTesting dynamic master facility addition...");
  const tempWarehouse = await createFacility({
    name: "Temp Integration Warehouse",
    shortName: "TIW",
    address: "Peenya 2nd Stage, Bengaluru",
    latitude: 13.03,
    longitude: 77.51,
    isWarehouse: true,
    isLaundry: false,
    serviceMins: 180,
    isActive: true,
  });

  const refreshedPlan = await getPlanById("manual-current");
  assert.ok(
    refreshedPlan?.plan.depots?.some((d) => d.id === tempWarehouse.id),
    "New active warehouse must appear in merged plan depots",
  );
  console.log("  New active warehouse appeared in merged plan depots.");

  // Test deactivating unreferenced facility -> must disappear from plan depots
  console.log("\nTesting unreferenced inactive facility exclusion...");
  await updateFacility(tempWarehouse.id, {
    name: tempWarehouse.name,
    shortName: tempWarehouse.shortName,
    address: tempWarehouse.address,
    latitude: tempWarehouse.latitude,
    longitude: tempWarehouse.longitude,
    isWarehouse: true,
    isLaundry: false,
    serviceMins: 180,
    isActive: false, // deactivate
  });

  const planAfterDeactivate = await getPlanById("manual-current");
  assert.ok(
    !planAfterDeactivate?.plan.depots?.some((d) => d.id === tempWarehouse.id),
    "Unreferenced inactive warehouse must NOT appear in merged plan depots",
  );
  console.log("  Unreferenced inactive warehouse successfully excluded.");

  // Clean up temp facility
  await deleteFacility(tempWarehouse.id);
  console.log("  Cleaned up temporary facility.");

  // 3. Deletion and role protection verification
  console.log("\nChecking delete and role protection for in-use facilities...");
  // Try to delete depot-yeshwanthpur -> MUST be blocked
  let deleteBlocked = false;
  try {
    await deleteFacility("depot-yeshwanthpur");
  } catch (err) {
    if (err instanceof FacilityConflictError) {
      deleteBlocked = true;
      console.log(`  Delete correctly blocked: "${err.message}"`);
    }
  }
  assert.ok(
    deleteBlocked,
    "Deleting depot-yeshwanthpur must throw FacilityConflictError",
  );

  // Try to remove Warehouse role from depot-yeshwanthpur -> MUST be blocked
  let roleRemovalBlocked = false;
  try {
    const hq = (await getFacilityAdminItems()).find(
      (f) => f.id === "depot-yeshwanthpur",
    )!;
    await updateFacility("depot-yeshwanthpur", {
      name: hq.name,
      shortName: hq.shortName,
      address: hq.address,
      latitude: hq.latitude,
      longitude: hq.longitude,
      isWarehouse: false, // attempt to remove role
      isLaundry: true,
      serviceMins: 180,
      isActive: true,
    });
  } catch (err) {
    if (err instanceof FacilityConflictError) {
      roleRemovalBlocked = true;
      console.log(`  Role removal correctly blocked: "${err.message}"`);
    }
  }
  assert.ok(
    roleRemovalBlocked,
    "Removing warehouse role from active depot must throw FacilityConflictError",
  );

  // 4. Deactivation of referenced facility
  console.log("\nChecking deactivation of facility...");
  const pioneerLaundry = (await getFacilityAdminItems()).find(
    (f) => f.id === "laundry-pioneer",
  )!;

  // Deactivate laundry-pioneer
  await updateFacility("laundry-pioneer", {
    name: pioneerLaundry.name,
    shortName: pioneerLaundry.shortName,
    address: pioneerLaundry.address,
    latitude: pioneerLaundry.latitude,
    longitude: pioneerLaundry.longitude,
    isWarehouse: pioneerLaundry.isWarehouse,
    isLaundry: pioneerLaundry.isLaundry,
    serviceMins: pioneerLaundry.serviceMins,
    isActive: false, // deactivate
  });
  console.log("  Deactivation of facility succeeded.");

  // Re-activate laundry-pioneer
  await updateFacility("laundry-pioneer", {
    name: pioneerLaundry.name,
    shortName: pioneerLaundry.shortName,
    address: pioneerLaundry.address,
    latitude: pioneerLaundry.latitude,
    longitude: pioneerLaundry.longitude,
    isWarehouse: pioneerLaundry.isWarehouse,
    isLaundry: pioneerLaundry.isLaundry,
    serviceMins: pioneerLaundry.serviceMins,
    isActive: true,
  });
  console.log("  Restored laundry-pioneer to active.");

  console.log("\nAll Facilities Integration Tests Passed Successfully! ✅");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
