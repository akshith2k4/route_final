import assert from "node:assert/strict";
import fs from "node:fs";
import {
  addStopsToRoute,
  computePlan,
  createMatrixLookup,
  createRoute,
  deleteRoute,
  depotLabel,
  findStop,
  formatClock,
  getPlanDepots,
  migratePlanDepots,
  moveStop,
  optimizeRouteOrder,
  parseClock,
  reassignRouteDepot,
  reorderStops,
  routeDepot,
  routeDepotId,
  SECOND_DEPOT_ID,
} from "../lib/plan.ts";

const plan = JSON.parse(fs.readFileSync("data/plan.json", "utf8"));
const matrix = JSON.parse(fs.readFileSync("data/travel_matrix.json", "utf8"));
const manualRoutes = JSON.parse(
  fs.readFileSync("data/manual_routes.json", "utf8"),
);

assert.equal(plan.routes.length, 8, "expected 8 routes");
assert.equal(
  plan.routes.reduce((sum, route) => sum + route.stops.length, 0),
  101,
  "expected 101 stops",
);
assert.equal(
  plan.routes.reduce(
    (sum, route) =>
      sum + route.stops.reduce((child, stop) => child + stop.load_bags, 0),
    0,
  ),
  387,
  "expected 387 bags",
);

assert.equal(matrix.points.length, 103, "expected 103 matrix points");
assert.equal(matrix.missing_pairs, 0, "matrix should be complete");
assert.equal(matrix.durations_s.length, 103);
assert.equal(matrix.distances_m.length, 103);

assert.equal(parseClock("06:30 AM"), 390);
assert.equal(parseClock("07:00 AM"), 420);
assert.equal(parseClock("3:54 PM"), 954);
assert.equal(parseClock("4:30 PM"), 990);
assert.equal(parseClock("17:00"), 1020);
assert.equal(formatClock(390), "06:30 AM");
assert.equal(formatClock(420), "07:00 AM");
assert.equal(formatClock(954), "03:54 PM");
assert.equal(formatClock(990), "04:30 PM");

assert.equal(plan.shift.start_min, 390, "shift should start at 06:30");
assert.equal(plan.shift.end_min, 990, "shift should end at 16:30");

for (let routeIndex = 0; routeIndex < plan.routes.length; routeIndex += 1) {
  const route = plan.routes[routeIndex];
  const manual = manualRoutes[routeIndex];
  assert.equal(route.route_id, manual.route_id);
  assert.deepEqual(
    route.stops.map((stop) => stop.name),
    manual.stops.map((stop) => stop.name),
    `stop order changed during migration for ${route.name}`,
  );
}

const computation = computePlan(plan, matrix);
assert.equal(computation.totals.routes, 8);
assert.equal(computation.totals.hotels, 101);
assert.equal(computation.totals.bags, 387);
assert.ok(
  computation.issues.filter((issue) => issue.code === "over_nominal_capacity")
    .length >= 7,
  "expected the seven overloaded routes to be flagged",
);
assert.ok(
  computation.issues.filter((issue) => issue.code === "shift_overrun").length >=
    1,
  "expected routes finishing after the 16:30 shift end to be flagged",
);

// ---------------------------------------------------------------------------
// Multi-warehouse assignment
// ---------------------------------------------------------------------------

const depots = getPlanDepots(plan);
assert.equal(depots.length, 2, "expected two warehouses");
assert.equal(depots[0].id, plan.depot.id, "primary depot should come first");
const secondDepot = depots.find((depot) => depot.id === SECOND_DEPOT_ID);
assert.ok(secondDepot, "expected the Second Warehouse");
assert.equal(secondDepot.name, "Second Warehouse");
assert.equal(depotLabel(secondDepot), "WH2");
assert.equal(
  plan.routes.every(
    (route) => routeDepotId(plan, route) === plan.depot.id,
  ),
  true,
  "all baseline routes should start at HQ",
);
assert.equal(
  routeDepot(plan, plan.routes[0]).id,
  plan.depot.id,
  "route depot should resolve to HQ by default",
);

const warehouseTestRoute = plan.routes.find(
  (route) => route.route_id === "103607",
);
assert.ok(warehouseTestRoute);
const hqComputed = computation.routes.find(
  (route) => route.route_id === "103607",
);
const movedToSecond = reassignRouteDepot(
  plan,
  "103607",
  SECOND_DEPOT_ID,
  matrix,
);
const movedWarehouseRoute = movedToSecond.routes.find(
  (route) => route.route_id === "103607",
);
assert.ok(movedWarehouseRoute);
assert.equal(
  movedWarehouseRoute.depot_id,
  SECOND_DEPOT_ID,
  "reassignment should persist the warehouse id",
);
assert.deepEqual(
  [...movedWarehouseRoute.stops.map((stop) => stop.hotel_id)].sort(),
  [...warehouseTestRoute.stops.map((stop) => stop.hotel_id)].sort(),
  "reassignment must preserve the hotel set",
);
assert.equal(
  plan.routes.find((route) => route.route_id === "103607").depot_id,
  plan.depot.id,
  "reassignment must not mutate the original plan",
);

const movedWarehouseComputed = computePlan(
  movedToSecond,
  matrix,
).routes.find((route) => route.route_id === "103607");
assert.ok(movedWarehouseComputed);
assert.equal(movedWarehouseComputed.depot_id, SECOND_DEPOT_ID);
assert.equal(movedWarehouseComputed.depot_name, "Second Warehouse");
assert.notEqual(
  movedWarehouseComputed.total_dist_km,
  hqComputed.total_dist_km,
  "distance should be recalculated from the new warehouse",
);

const matrixIndex = new Map(
  matrix.points.map((point, index) => [point.id, index]),
);
const factor = matrix.duration_factor ?? 1;
const driveFromDepot = (depotId, stops) => {
  let seconds = 0;
  let previousId = depotId;
  for (const stop of stops) {
    seconds +=
      matrix.durations_s[matrixIndex.get(previousId)][
        matrixIndex.get(stop.hotel_id)
      ] * factor;
    previousId = stop.hotel_id;
  }
  seconds +=
    matrix.durations_s[matrixIndex.get(previousId)][
      matrixIndex.get(depotId)
    ] * factor;
  return Math.round(seconds / 60);
};
assert.equal(
  movedWarehouseComputed.total_drive_mins,
  driveFromDepot(SECOND_DEPOT_ID, movedWarehouseRoute.stops),
  "the reassigned route must start and end at the Second Warehouse",
);
assert.ok(
  movedWarehouseComputed.total_drive_mins <=
    driveFromDepot(SECOND_DEPOT_ID, warehouseTestRoute.stops),
  "reassignment should not worsen the route from the new warehouse",
);

const returnedToHq = reassignRouteDepot(
  movedToSecond,
  "103607",
  plan.depot.id,
  matrix,
);
assert.equal(
  returnedToHq.routes.find((route) => route.route_id === "103607").depot_id,
  plan.depot.id,
  "routes should be assignable back to HQ",
);

const legacyDraft = structuredClone(plan);
delete legacyDraft.depots;
for (const route of legacyDraft.routes) delete route.depot_id;
const migratedDraft = migratePlanDepots(legacyDraft, plan);
assert.equal(
  getPlanDepots(migratedDraft).length,
  2,
  "migration should merge warehouses added after the draft was saved",
);
assert.equal(
  migratedDraft.routes.every(
    (route) => route.depot_id === plan.depot.id,
  ),
  true,
  "legacy routes should default to HQ",
);

const secondDraft = structuredClone(legacyDraft);
secondDraft.routes[0].depot_id = SECOND_DEPOT_ID;
const migratedSecondDraft = migratePlanDepots(secondDraft, plan);
assert.equal(
  migratedSecondDraft.routes[0].depot_id,
  SECOND_DEPOT_ID,
  "migration must preserve an explicit warehouse assignment",
);

assert.throws(
  () =>
    createRoute(plan, {
      name: "Unknown warehouse route",
      capacity: 40,
      depot_id: "depot-nowhere",
    }),
  /Unknown warehouse/,
  "routes cannot be created at an unknown warehouse",
);

console.log("");
console.log("Warehouse assignment smoke test (Route 7, HQ -> Second Warehouse):");
console.log(
  `  drive ${hqComputed.total_drive_mins} min from HQ -> ${movedWarehouseComputed.total_drive_mins} min from WH2`,
);
console.log(
  `  distance ${hqComputed.total_dist_km} km -> ${movedWarehouseComputed.total_dist_km} km`,
);

console.log("Route comparison (manual Google data vs OSRM recalculation)");
console.log(
  "route   hotels  bags  manual_km  osrm_km  manual_drive  osrm_drive  manual_return  osrm_return",
);
for (let index = 0; index < computation.routes.length; index += 1) {
  const computed = computation.routes[index];
  const manual = manualRoutes[index];
  console.log(
    [
      computed.route_id,
      String(computed.total_hotels).padStart(6),
      String(computed.total_bags).padStart(4),
      String(manual.total_dist_km).padStart(9),
      String(computed.total_dist_km).padStart(7),
      String(manual.total_drive_mins).padStart(12),
      String(computed.total_drive_mins).padStart(10),
      manual.return_hq.padStart(13),
      computed.return_hq.padStart(11),
    ].join("  "),
  );
  assert.ok(
    Math.abs(computed.total_dist_km - manual.total_dist_km) /
      manual.total_dist_km <
      0.25,
    `distance drift too large for ${computed.name}: ${manual.total_dist_km} -> ${computed.total_dist_km}`,
  );
}

console.log("");
console.log("Validation issues:");
for (const issue of computation.issues) {
  console.log(`  [${issue.severity}] ${issue.code}: ${issue.message}`);
}

const routeOne = plan.routes.find((route) => route.route_id === "103501");
assert.ok(routeOne);
const beforeOrder = routeOne.stops.map((stop) => stop.hotel_id);
const beforeDistance = computation.routes.find(
  (route) => route.route_id === "103501",
).total_dist_km;

assert.equal(
  reorderStops(plan, "103501", 2, 2),
  plan,
  "reorder to the same index should be a no-op",
);

const reordered = reorderStops(plan, "103501", 2, 5);
const reorderedRoute = reordered.routes.find(
  (route) => route.route_id === "103501",
);
assert.ok(reorderedRoute);
const afterOrder = reorderedRoute.stops.map((stop) => stop.hotel_id);
assert.deepEqual(
  [...afterOrder].sort(),
  [...beforeOrder].sort(),
  "reorder must preserve the hotel set",
);
assert.notDeepEqual(afterOrder, beforeOrder, "reorder must change the sequence");
assert.deepEqual(
  routeOne.stops.map((stop) => stop.hotel_id),
  beforeOrder,
  "reorder must not mutate the original plan",
);
assert.equal(reorderedRoute.stops.length, routeOne.stops.length);

const reorderedComputation = computePlan(reordered, matrix);
const reorderedRouteComputation = reorderedComputation.routes.find(
  (route) => route.route_id === "103501",
);
assert.equal(reorderedRouteComputation.total_bags, 50);
assert.equal(
  reorderedComputation.totals.bags,
  computation.totals.bags,
  "reorder must not change total plan bags",
);

console.log("");
console.log("Reorder smoke test (Route 1, stop 3 -> 6):");
console.log(`  before: ${beforeOrder.join(" -> ")}`);
console.log(`  after:  ${afterOrder.join(" -> ")}`);
console.log(
  `  distance ${beforeDistance} km -> ${reorderedRouteComputation.total_dist_km} km; return ${
    computation.routes.find((route) => route.route_id === "103501").return_hq
  } -> ${reorderedRouteComputation.return_hq}`,
);

const fountainTree = plan.routes
  .find((route) => route.route_id === "103603")
  .stops.find((stop) => stop.name === "FOUNTAIN TREE");
assert.ok(fountainTree, "expected FOUNTAIN TREE on route 103603");
const fountain = findStop(plan, fountainTree.hotel_id);
assert.ok(fountain);
assert.equal(fountain.route.route_id, "103603");

const sameRouteMove = moveStop(plan, fountainTree.hotel_id, "103603", 0);
const sameRoute = sameRouteMove.routes.find(
  (route) => route.route_id === "103603",
);
assert.equal(
  sameRoute.stops[0].hotel_id,
  fountainTree.hotel_id,
  "same-route move with an index should reorder",
);
assert.equal(
  sameRoute.stops.length,
  fountain.route.stops.length,
  "same-route move must not change the stop count",
);

assert.throws(
  () => moveStop(plan, fountainTree.hotel_id, "103501", 0, matrix),
  /would exceed its 40-bag vehicle limit/,
  "moves into a route with insufficient capacity should be rejected",
);

const tightPlan = structuredClone(plan);
const tightTarget = tightPlan.routes.find(
  (route) => route.route_id === "103607",
);
tightTarget.stops[0].load_bags += 39;
assert.throws(
  () => moveStop(tightPlan, fountainTree.hotel_id, "103607", undefined, matrix),
  /would exceed its 70-bag vehicle limit/,
  "moves that only exceed capacity after insertion should be rejected",
);

assert.throws(
  () => moveStop(plan, fountainTree.hotel_id, "103607"),
  /travel matrix is required/,
  "cheapest insertion without a matrix should fail",
);

const moved = moveStop(plan, fountainTree.hotel_id, "103607", undefined, matrix);
const movedSource = moved.routes.find((route) => route.route_id === "103603");
const movedTarget = moved.routes.find((route) => route.route_id === "103607");
assert.ok(movedSource);
assert.ok(movedTarget);
assert.equal(
  movedSource.stops.some((stop) => stop.hotel_id === fountainTree.hotel_id),
  false,
  "source route must lose the stop",
);
assert.equal(
  movedTarget.stops.some((stop) => stop.hotel_id === fountainTree.hotel_id),
  true,
  "target route must gain the stop",
);
assert.equal(
  movedSource.stops.length,
  fountain.route.stops.length - 1,
  "source route stop count must drop by one",
);

const movedComputation = computePlan(moved, matrix);
const movedSourceComputed = movedComputation.routes.find(
  (route) => route.route_id === "103603",
);
const movedTargetComputed = movedComputation.routes.find(
  (route) => route.route_id === "103607",
);
assert.equal(
  movedComputation.totals.bags,
  computation.totals.bags,
  "move must preserve total plan bags",
);
assert.equal(
  movedSourceComputed.total_bags,
  computation.routes.find((route) => route.route_id === "103603").total_bags -
    fountainTree.load_bags,
  "source load must drop by the moved stop load",
);
assert.equal(
  movedTargetComputed.total_bags,
  computation.routes.find((route) => route.route_id === "103607").total_bags +
    fountainTree.load_bags,
  "target load must rise by the moved stop load",
);

assert.throws(
  () => moveStop(moved, fountainTree.hotel_id, "103607"),
  /targetIndex is required/,
  "same-route move without an index should fail",
);

console.log("");
console.log("Move smoke test (FOUNTAIN TREE, 103603 -> 103607):");
console.log(
  `  source ${computation.routes.find((route) => route.route_id === "103603").total_bags} -> ${movedSourceComputed.total_bags} bags`,
);
console.log(
  `  target ${computation.routes.find((route) => route.route_id === "103607").total_bags} -> ${movedTargetComputed.total_bags} bags`,
);
console.log(
  `  target return ${computation.routes.find((route) => route.route_id === "103607").return_hq} -> ${movedTargetComputed.return_hq}`,
);

// ---------------------------------------------------------------------------
// Custom routes
// ---------------------------------------------------------------------------

const customPlan = createRoute(plan, {
  name: "Route 9 - North",
  capacity: 40,
});
assert.equal(customPlan.routes.length, plan.routes.length + 1);
const customRoute = customPlan.routes[customPlan.routes.length - 1];
assert.equal(customRoute.is_custom, true, "custom route should be flagged");
assert.equal(customRoute.route_id.startsWith("custom-"), true);
assert.equal(customRoute.name, "Route 9 - North");
assert.equal(customRoute.nominal_cap, 40);
assert.equal(customRoute.max_load, 36, "safe load should be 90% of capacity");
assert.equal(customRoute.departure_min, 7 * 60);
assert.equal(customRoute.stops.length, 0, "new routes start empty");
assert.equal(
  customRoute.depot_id,
  plan.depot.id,
  "new routes should default to HQ",
);

const secondWarehouseRoute = createRoute(plan, {
  name: "Route WH2",
  capacity: 40,
  depot_id: SECOND_DEPOT_ID,
});
assert.equal(
  secondWarehouseRoute.routes[secondWarehouseRoute.routes.length - 1].depot_id,
  SECOND_DEPOT_ID,
  "new routes should accept a warehouse",
);
assert.equal(
  plan.routes.length,
  8,
  "creating a route must not mutate the original plan",
);

const customComputation = computePlan(customPlan, matrix);
assert.equal(
  customComputation.issues.some(
    (issue) =>
      issue.code === "empty_route" && issue.route_id === customRoute.route_id,
  ),
  false,
  "empty custom routes should not raise empty_route warnings",
);

const donorRoute = plan.routes.find((route) => route.route_id === "103607");
assert.ok(donorRoute, "expected route 103607 as the donor");
const pickedStops = donorRoute.stops.slice(0, 3);
const pickedIds = pickedStops.map((stop) => stop.hotel_id);
const pickedBags = pickedStops.reduce((sum, stop) => sum + stop.load_bags, 0);
assert.ok(
  pickedBags <= customRoute.nominal_cap,
  "test fixture should fit the custom route",
);

const addedPlan = addStopsToRoute(
  customPlan,
  customRoute.route_id,
  pickedIds,
  matrix,
);
const addedRoute = addedPlan.routes.find(
  (route) => route.route_id === customRoute.route_id,
);
assert.ok(addedRoute);
assert.equal(addedRoute.stops.length, pickedStops.length);
assert.deepEqual(
  [...addedRoute.stops.map((stop) => stop.hotel_id)].sort(),
  [...pickedIds].sort(),
  "the custom route should contain exactly the selected hotels",
);

const addedDonor = addedPlan.routes.find(
  (route) => route.route_id === donorRoute.route_id,
);
assert.ok(addedDonor);
assert.equal(
  addedDonor.stops.some((stop) => pickedIds.includes(stop.hotel_id)),
  false,
  "donor route should lose the selected hotels",
);
assert.deepEqual(
  addedDonor.stops.map((stop) => stop.hotel_id),
  donorRoute.stops
    .filter((stop) => !pickedIds.includes(stop.hotel_id))
    .map((stop) => stop.hotel_id),
  "donor routes must keep their existing stop order",
);

const addedComputation = computePlan(addedPlan, matrix);
assert.equal(
  addedComputation.totals.bags,
  computation.totals.bags,
  "moving hotels onto a custom route must preserve total plan bags",
);
assert.equal(
  addedComputation.totals.hotels,
  computation.totals.hotels,
  "moving hotels onto a custom route must preserve the hotel set",
);

const naivePlan = {
  ...customPlan,
  routes: customPlan.routes.map((route) =>
    route.route_id === customRoute.route_id
      ? { ...route, stops: pickedStops }
      : route,
  ),
};
const naiveDrive = computePlan(naivePlan, matrix).routes.find(
  (route) => route.route_id === customRoute.route_id,
).total_drive_mins;
const addedDrive = addedComputation.routes.find(
  (route) => route.route_id === customRoute.route_id,
).total_drive_mins;
assert.ok(
  addedDrive <= naiveDrive,
  `cheapest insertion + 2-opt should not worsen the route (${addedDrive} > ${naiveDrive})`,
);

const heavyStop = plan.routes
  .flatMap((route) => route.stops)
  .reduce((heaviest, stop) =>
    stop.load_bags > heaviest.load_bags ? stop : heaviest,
  );
assert.ok(heavyStop.load_bags > 1, "expected a multi-bag hotel in the fixture");
const tinyPlan = createRoute(plan, {
  name: "Route 10 - Tiny",
  capacity: heavyStop.load_bags - 1,
});
assert.throws(
  () =>
    addStopsToRoute(
      tinyPlan,
      tinyPlan.routes[tinyPlan.routes.length - 1].route_id,
      [heavyStop.hotel_id],
      matrix,
    ),
  /would exceed its \d+-bag vehicle limit/,
  "a batch that exceeds vehicle capacity should be rejected atomically",
);
assert.equal(tinyPlan.routes[tinyPlan.routes.length - 1].stops.length, 0);
assert.equal(
  addStopsToRoute(
    tinyPlan,
    tinyPlan.routes[tinyPlan.routes.length - 1].route_id,
    [],
    matrix,
  ),
  tinyPlan,
  "an empty add should be a no-op",
);
assert.throws(
  () =>
    addStopsToRoute(
      addedPlan,
      customRoute.route_id,
      [pickedIds[0]],
      matrix,
    ),
  /already on Route 9 - North/,
  "hotels already on the target route should be rejected",
);

const emptyDeleted = deleteRoute(customPlan, customRoute.route_id);
assert.equal(emptyDeleted.routes.length, plan.routes.length);
assert.equal(
  emptyDeleted.routes.some((route) => route.route_id === customRoute.route_id),
  false,
  "empty custom routes should delete",
);
const restoredDeleted = deleteRoute(addedPlan, customRoute.route_id, {
  restoreFrom: plan,
});
assert.equal(restoredDeleted.routes.length, plan.routes.length);
assert.equal(
  restoredDeleted.routes.some(
    (route) => route.route_id === customRoute.route_id,
  ),
  false,
  "non-empty custom routes should delete",
);
assert.deepEqual(
  restoredDeleted,
  plan,
  "deleting a custom route should restore its hotels to the original plan",
);
assert.equal(
  addedPlan.routes.length,
  9,
  "deleting must not mutate the plan it was called with",
);

const unassignedDeleted = deleteRoute(addedPlan, customRoute.route_id);
assert.equal(unassignedDeleted.routes.length, plan.routes.length);
assert.deepEqual(
  [...(unassignedDeleted.unassigned_hotel_ids ?? [])].sort(),
  [...pickedIds].sort(),
  "without a restore plan, deleted stops should remain unassigned",
);
assert.equal(
  computePlan(unassignedDeleted, matrix).totals.hotels,
  computation.totals.hotels - pickedIds.length,
  "unassigned hotels should leave the routed totals but stay in the plan",
);

assert.throws(
  () => deleteRoute(plan, "103501"),
  /baseline route and cannot be deleted/,
  "baseline routes must not delete",
);

const reversedPlan = structuredClone(plan);
const reversedRoute = reversedPlan.routes.find(
  (route) => route.route_id === "103501",
);
assert.ok(reversedRoute);
reversedRoute.stops.reverse();
const reversedDrive = computePlan(reversedPlan, matrix).routes.find(
  (route) => route.route_id === "103501",
).total_drive_mins;
const optimizedPlan = optimizeRouteOrder(reversedPlan, "103501", matrix);
const optimizedRoute = optimizedPlan.routes.find(
  (route) => route.route_id === "103501",
);
assert.ok(optimizedRoute);
assert.deepEqual(
  [...optimizedRoute.stops.map((stop) => stop.hotel_id)].sort(),
  [...reversedRoute.stops.map((stop) => stop.hotel_id)].sort(),
  "optimization must preserve the hotel set",
);
const optimizedDrive = computePlan(optimizedPlan, matrix).routes.find(
  (route) => route.route_id === "103501",
).total_drive_mins;
assert.ok(
  optimizedDrive <= reversedDrive,
  `2-opt must not worsen the route (${optimizedDrive} > ${reversedDrive})`,
);
assert.equal(
  optimizeRouteOrder(optimizedPlan, "103501", matrix),
  optimizedPlan,
  "optimizing an already polished order should be a no-op",
);

console.log("");
console.log("Custom route smoke test:");
console.log(
  `  created ${customRoute.name} (${customRoute.nominal_cap} bags, safe ${customRoute.max_load})`,
);
console.log(
  `  moved ${pickedStops.length} hotels (${pickedBags} bags) from ${donorRoute.name}`,
);
console.log(
  `  custom route drive ${naiveDrive} min -> ${addedDrive} min after insertion + 2-opt`,
);
console.log(
  `  reversed Route 1 drive ${reversedDrive} min -> ${optimizedDrive} min after 2-opt`,
);

console.log("");
console.log("All plan-engine checks passed.");
