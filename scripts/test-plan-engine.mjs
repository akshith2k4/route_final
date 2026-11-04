import assert from "node:assert/strict";
import fs from "node:fs";
import {
  computePlan,
  findStop,
  formatClock,
  moveStop,
  parseClock,
  reorderStops,
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

assert.equal(matrix.points.length, 102, "expected 102 matrix points");
assert.equal(matrix.missing_pairs, 0, "matrix should be complete");
assert.equal(matrix.durations_s.length, 102);
assert.equal(matrix.distances_m.length, 102);

assert.equal(parseClock("07:00 AM"), 420);
assert.equal(parseClock("3:54 PM"), 954);
assert.equal(parseClock("17:00"), 1020);
assert.equal(formatClock(420), "07:00 AM");
assert.equal(formatClock(954), "03:54 PM");

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

console.log("");
console.log("All plan-engine checks passed.");
