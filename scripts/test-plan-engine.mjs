import assert from "node:assert/strict";
import fs from "node:fs";
import {
  addNewHotelToRoute,
  addStopsToRoute,
  addVehicle,
  assignVehicleToRoute,
  computePlan,
  createMatrixLookup,
  createRoute,
  deleteRoute,
  deleteVehicle,
  depotLabel,
  findStop,
  formatClock,
  getPlanDepots,
  getPlanLaundries,
  getPlanVehicles,
  laundryLabel,
  migratePlanDepots,
  moveStop,
  optimizeRouteOrder,
  parseClock,
  parsePlanDraft,
  reassignRouteDepot,
  reorderStops,
  resolveLaundry,
  resolveVehicle,
  routeDepot,
  routeDepotId,
  routeLaundryId,
  routesUsingVehicle,
  safeLoadForCapacity,
  SECOND_DEPOT_ID,
  setRouteLaundry,
  summarizePlan,
  updateVehicle,
} from "../lib/plan.ts";
import { buildDayData } from "../lib/day-plan.ts";

const plan = JSON.parse(fs.readFileSync("data/plan.json", "utf8"));
const matrix = JSON.parse(fs.readFileSync("data/travel_matrix.json", "utf8"));
const manualRoutes = JSON.parse(
  fs.readFileSync("data/manual_routes.json", "utf8"),
);
const dayPlan = JSON.parse(fs.readFileSync("data/day_plan.json", "utf8"));
const hotels = JSON.parse(fs.readFileSync("data/hotels.json", "utf8"));

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
assert.equal(
  plan.routes.reduce(
    (sum, route) =>
      sum + route.stops.reduce((child, stop) => child + (stop.rooms ?? 0), 0),
    0,
  ),
  3423,
  "expected 3423 rooms",
);

const expectedRoomsByRoute = {
  103501: 440,
  103601: 433,
  103602: 270,
  103603: 546,
  103604: 350,
  103605: 676,
  103606: 516,
  103607: 192,
};
for (const route of plan.routes) {
  const rooms = route.stops.reduce((sum, stop) => sum + (stop.rooms ?? 0), 0);
  assert.equal(
    rooms,
    expectedRoomsByRoute[route.route_id],
    `room total mismatch for ${route.name}`,
  );
}

assert.equal(matrix.points.length, 105, "expected 105 matrix points");
assert.equal(matrix.missing_pairs, 0, "matrix should be complete");
assert.equal(matrix.durations_s.length, 105);
assert.equal(matrix.distances_m.length, 105);

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
assert.equal(computation.totals.rooms, 3423);
for (const route of computation.routes) {
  assert.equal(
    route.total_rooms,
    expectedRoomsByRoute[route.route_id],
    `computed room total mismatch for ${route.name}`,
  );
}
assert.equal(
  computation.issues.filter(
    (issue) => issue.code === "over_nominal_capacity",
  ).length,
  0,
  "routes without a vehicle should not be capacity-checked",
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

// ---------------------------------------------------------------------------
// Optional laundry stop (hotels -> laundry -> warehouse)
// ---------------------------------------------------------------------------

const LAUNDRY_PIONEER_ID = "laundry-pioneer";
const LAUNDRY_SOLUTIONS_ID = "laundry-solutions";
const laundries = getPlanLaundries(plan);
assert.equal(laundries.length, 2, "expected two laundries");
const pioneer = laundries.find((laundry) => laundry.id === LAUNDRY_PIONEER_ID);
assert.ok(pioneer, "expected the Pioneer laundry");
assert.equal(pioneer.name, "Pioneer");
assert.equal(pioneer.service_mins, 180);
assert.equal(laundryLabel(pioneer), "Pioneer");
const solutions = laundries.find(
  (laundry) => laundry.id === LAUNDRY_SOLUTIONS_ID,
);
assert.ok(solutions, "expected the Laundry Solutions site");
assert.equal(solutions.name, "Laundry Solutions");
assert.equal(solutions.service_mins, 180);
assert.equal(
  plan.routes.every((route) => routeLaundryId(plan, route) === null),
  true,
  "all baseline routes should return directly to the warehouse",
);
assert.equal(resolveLaundry(plan, plan.routes[0]), null);

const laundryRouteId = "103501";
const directRoute = plan.routes.find(
  (route) => route.route_id === laundryRouteId,
);
const directComputed = computation.routes.find(
  (route) => route.route_id === laundryRouteId,
);
const withLaundry = setRouteLaundry(
  plan,
  laundryRouteId,
  LAUNDRY_PIONEER_ID,
  matrix,
);
const laundryRoute = withLaundry.routes.find(
  (route) => route.route_id === laundryRouteId,
);
assert.equal(laundryRoute.laundry_id, LAUNDRY_PIONEER_ID);
assert.equal(
  resolveLaundry(withLaundry, laundryRoute).name,
  "Pioneer",
  "the route should resolve its laundry",
);
assert.deepEqual(
  [...laundryRoute.stops.map((stop) => stop.hotel_id)].sort(),
  [...directRoute.stops.map((stop) => stop.hotel_id)].sort(),
  "laundry must not change the hotel set",
);
assert.equal(
  plan.routes.find((route) => route.route_id === laundryRouteId).laundry_id,
  undefined,
  "setting a laundry must not mutate the original plan",
);

const expectedEndDriveMins = (depotId, laundryId, stops) => {
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
      matrixIndex.get(laundryId)
    ] * factor;
  seconds +=
    matrix.durations_s[matrixIndex.get(laundryId)][
      matrixIndex.get(depotId)
    ] * factor;
  return Math.round(seconds / 60);
};

const laundryComputed = computePlan(withLaundry, matrix).routes.find(
  (route) => route.route_id === laundryRouteId,
);
assert.equal(laundryComputed.laundry_id, LAUNDRY_PIONEER_ID);
assert.equal(laundryComputed.laundry_name, "Pioneer");
assert.equal(laundryComputed.laundry_service_mins, 180);
assert.ok(laundryComputed.laundry_arrival_time);
assert.equal(
  laundryComputed.laundry_departure_min -
    laundryComputed.laundry_arrival_min,
  180,
  "the vehicle should spend three hours at the laundry",
);
assert.equal(
  laundryComputed.total_service_mins,
  directComputed.total_service_mins,
  "hotel service minutes should not absorb laundry time",
);
assert.ok(
  laundryComputed.total_dist_km > directComputed.total_dist_km,
  "the laundry detour should add distance",
);
assert.equal(
  laundryComputed.total_drive_mins,
  expectedEndDriveMins(
    plan.depot.id,
    LAUNDRY_PIONEER_ID,
    laundryRoute.stops,
  ),
  "drive time should include both laundry legs",
);
assert.ok(
  laundryComputed.return_min >=
    laundryComputed.laundry_departure_min +
      Math.round(
        (matrix.durations_s[matrixIndex.get(LAUNDRY_PIONEER_ID)][
          matrixIndex.get(plan.depot.id)
        ] *
          factor) /
          60,
      ) -
      1,
  "return time should include the laundry-to-warehouse leg",
);
assert.equal(
  computePlan(withLaundry, matrix).totals.rooms,
  3423,
  "laundry must not change room totals",
);

const clearedLaundry = setRouteLaundry(
  withLaundry,
  laundryRouteId,
  null,
  matrix,
);
const clearedComputed = computePlan(clearedLaundry, matrix).routes.find(
  (route) => route.route_id === laundryRouteId,
);
assert.equal(clearedComputed.laundry_id, null);
assert.equal(clearedComputed.laundry_service_mins, 0);
assert.equal(clearedComputed.laundry_arrival_time, null);
assert.equal(
  clearedLaundry.routes.find((route) => route.route_id === laundryRouteId)
    .laundry_id,
  undefined,
  "clearing should remove the laundry id",
);

const movedWithLaundry = reassignRouteDepot(
  withLaundry,
  laundryRouteId,
  SECOND_DEPOT_ID,
  matrix,
);
const movedWithLaundryRoute = movedWithLaundry.routes.find(
  (route) => route.route_id === laundryRouteId,
);
assert.equal(
  movedWithLaundryRoute.laundry_id,
  LAUNDRY_PIONEER_ID,
  "moving warehouses should keep the laundry selection",
);
assert.equal(movedWithLaundryRoute.depot_id, SECOND_DEPOT_ID);
const movedWithLaundryComputed = computePlan(
  movedWithLaundry,
  matrix,
).routes.find((route) => route.route_id === laundryRouteId);
assert.equal(
  movedWithLaundryComputed.total_drive_mins,
  expectedEndDriveMins(
    SECOND_DEPOT_ID,
    LAUNDRY_PIONEER_ID,
    movedWithLaundryRoute.stops,
  ),
  "a WH2 route should run hotels -> Pioneer -> WH2",
);

const withSolutions = setRouteLaundry(
  plan,
  "103602",
  LAUNDRY_SOLUTIONS_ID,
  matrix,
);
const solutionsComputed = computePlan(withSolutions, matrix).routes.find(
  (route) => route.route_id === "103602",
);
assert.equal(solutionsComputed.laundry_name, "Laundry Solutions");
assert.equal(solutionsComputed.laundry_service_mins, 180);

assert.throws(
  () => setRouteLaundry(plan, "103501", "laundry-nowhere"),
  /Unknown laundry/,
  "routes cannot use an unknown laundry",
);

// ---------------------------------------------------------------------------
// Fleet inventory and per-route vehicle assignment
// ---------------------------------------------------------------------------

const vehicles = getPlanVehicles(plan);
assert.equal(vehicles.length, 10, "expected the fleet inventory");
assert.equal(
  plan.routes.every((route) => !route.vehicle_id),
  true,
  "baseline routes should start without a vehicle",
);
assert.equal(
  vehicles.every(
    (vehicle) => routesUsingVehicle(plan, vehicle.id).length === 0,
  ),
  true,
  "every fleet vehicle should start unassigned",
);
assert.equal(safeLoadForCapacity(35), 31);
assert.equal(safeLoadForCapacity(70), 63);

const vehicleRoute1 = plan.routes[0];
assert.equal(resolveVehicle(plan, vehicleRoute1), null);
assert.equal(
  vehicleRoute1.nominal_cap,
  40,
  "the route keeps its fallback capacity until a vehicle is assigned",
);

const onVehicle9 = assignVehicleToRoute(
  plan,
  vehicleRoute1.route_id,
  "vehicle-9",
);
const vehicle9 = getPlanVehicles(onVehicle9).find(
  (vehicle) => vehicle.id === "vehicle-9",
);
assert.ok(vehicle9);
assert.equal(onVehicle9.routes[0].vehicle_id, "vehicle-9");
assert.equal(onVehicle9.routes[0].nominal_cap, vehicle9.nominal_cap);
assert.equal(onVehicle9.routes[0].max_load, vehicle9.max_load);
assert.equal(
  plan.routes[0].vehicle_id,
  vehicleRoute1.vehicle_id,
  "assignment must not mutate the original plan",
);

const manualRoute = assignVehicleToRoute(
  onVehicle9,
  vehicleRoute1.route_id,
  null,
);
const manualRouteEntry = manualRoute.routes.find(
  (route) => route.route_id === vehicleRoute1.route_id,
);
assert.equal(manualRouteEntry.vehicle_id, undefined);
assert.equal(
  manualRouteEntry.nominal_cap,
  vehicle9.nominal_cap,
  "releasing a vehicle keeps the current route capacity",
);

assert.throws(
  () => assignVehicleToRoute(onVehicle9, "103601", "vehicle-9"),
  /already allocated to/,
  "a vehicle already on another route must be blocked",
);

const duplicatePlan = structuredClone(plan);
const duplicateVehicleId = getPlanVehicles(duplicatePlan)[0].id;
duplicatePlan.routes[0].vehicle_id = duplicateVehicleId;
duplicatePlan.routes[1].vehicle_id = duplicateVehicleId;
assert.equal(
  computePlan(duplicatePlan, matrix).issues.some(
    (issue) => issue.code === "vehicle_double_booked",
  ),
  true,
  "a legacy shared vehicle should still raise a warning",
);

const shrunk = updateVehicle(onVehicle9, "vehicle-9", {
  capacity: 30,
  name: "Truck 9",
});
const shrunkVehicle = getPlanVehicles(shrunk).find(
  (vehicle) => vehicle.id === "vehicle-9",
);
assert.equal(shrunkVehicle.name, "Truck 9");
assert.equal(shrunkVehicle.nominal_cap, 30);
assert.equal(shrunkVehicle.max_load, 27);
const shrunkRoute1 = shrunk.routes.find(
  (candidate) => candidate.route_id === "103501",
);
assert.equal(shrunkRoute1.nominal_cap, 30);
assert.equal(shrunkRoute1.max_load, 27);
const untouchedRoute2 = shrunk.routes.find(
  (candidate) => candidate.route_id === "103601",
);
assert.equal(
  untouchedRoute2.nominal_cap,
  plan.routes.find((route) => route.route_id === "103601").nominal_cap,
  "capacity changes must only touch routes using that vehicle",
);
assert.equal(
  computePlan(shrunk, matrix).issues.some(
    (issue) =>
      issue.code === "over_nominal_capacity" &&
      issue.route_id === "103501",
  ),
  true,
  "capacity changes should surface over-capacity routes",
);

const addedVehiclePlan = addVehicle(plan, {
  name: "Spare Truck",
  capacity: 25,
});
assert.equal(getPlanVehicles(addedVehiclePlan).length, 11);
const addedVehicle = getPlanVehicles(addedVehiclePlan).at(-1);
assert.equal(addedVehicle.nominal_cap, 25);
assert.equal(addedVehicle.max_load, 22);
const afterDelete = deleteVehicle(addedVehiclePlan, addedVehicle.id);
assert.equal(getPlanVehicles(afterDelete).length, 10);
assert.throws(
  () => deleteVehicle(onVehicle9, "vehicle-9"),
  /assigned to/,
  "assigned vehicles cannot be deleted",
);

const vehicleRoutePlan = createRoute(plan, {
  name: "Vehicle route",
  capacity: 10,
  vehicle_id: "vehicle-9",
});
const vehicleRoute = vehicleRoutePlan.routes.at(-1);
assert.equal(vehicleRoute.vehicle_id, "vehicle-9");
assert.equal(
  vehicleRoute.nominal_cap,
  40,
  "vehicle capacity should override the manual capacity",
);
assert.equal(vehicleRoute.max_load, 36);
assert.throws(
  () =>
    createRoute(onVehicle9, {
      name: "Blocked vehicle route",
      capacity: 40,
      vehicle_id: "vehicle-9",
    }),
  /already allocated to/,
  "new routes cannot reuse a vehicle already on another route",
);
assert.throws(
  () =>
    createRoute(plan, {
      name: "Unknown vehicle",
      capacity: 40,
      vehicle_id: "vehicle-nowhere",
    }),
  /Unknown vehicle/,
);

const legacyDraft = structuredClone(plan);
delete legacyDraft.depots;
delete legacyDraft.laundries;
delete legacyDraft.vehicles;
for (const route of legacyDraft.routes) {
  delete route.depot_id;
  delete route.laundry_id;
  delete route.vehicle_id;
}
const migratedDraft = migratePlanDepots(legacyDraft, plan);
assert.equal(
  getPlanDepots(migratedDraft).length,
  2,
  "migration should merge warehouses added after the draft was saved",
);
assert.equal(
  getPlanLaundries(migratedDraft).length,
  2,
  "migration should merge laundries added after the draft was saved",
);
assert.equal(
  migratedDraft.routes.every(
    (route) => route.depot_id === plan.depot.id,
  ),
  true,
  "legacy routes should default to HQ",
);
assert.equal(
  migratedDraft.routes.every(
    (route) => routeLaundryId(migratedDraft, route) === null,
  ),
  true,
  "legacy routes should return directly to the warehouse",
);
assert.equal(
  getPlanVehicles(migratedDraft).length,
  10,
  "migration should seed the fleet inventory",
);
for (const route of migratedDraft.routes) {
  const referenceRoute = plan.routes.find(
    (candidate) => candidate.route_id === route.route_id,
  );
  assert.equal(
    route.vehicle_id,
    referenceRoute.vehicle_id,
    "migration should copy the baseline vehicle assignment",
  );
  assert.equal(route.nominal_cap, referenceRoute.nominal_cap);
  assert.equal(route.max_load, referenceRoute.max_load);
}

const invalidLaundryDraft = structuredClone(plan);
invalidLaundryDraft.routes[0].laundry_id = "laundry-nowhere";
assert.equal(
  migratePlanDepots(invalidLaundryDraft, plan).routes[0].laundry_id,
  undefined,
  "migration should drop unknown laundries",
);

const editedVehiclesDraft = structuredClone(plan);
editedVehiclesDraft.vehicles = editedVehiclesDraft.vehicles.filter(
  (vehicle) => vehicle.id !== "vehicle-10",
);
editedVehiclesDraft.vehicles[0] = {
  ...editedVehiclesDraft.vehicles[0],
  name: "Truck A",
  nominal_cap: 44,
  max_load: 39,
};
editedVehiclesDraft.routes[0].vehicle_id = editedVehiclesDraft.vehicles[0].id;
const migratedEditedVehicles = migratePlanDepots(
  editedVehiclesDraft,
  plan,
);
assert.equal(
  getPlanVehicles(migratedEditedVehicles).length,
  9,
  "migration must not resurrect deleted vehicles",
);
assert.equal(getPlanVehicles(migratedEditedVehicles)[0].name, "Truck A");
assert.equal(
  migratedEditedVehicles.routes[0].nominal_cap,
  44,
  "route capacity should follow the draft vehicle",
);
assert.equal(migratedEditedVehicles.routes[0].max_load, 39);

const oldNumberingDraft = structuredClone(plan);
delete oldNumberingDraft.vehicles_version;
const oldVehicleIds = [
  "vehicle-1",
  "vehicle-2",
  "vehicle-5",
  "vehicle-4",
  "vehicle-3",
  "vehicle-6",
  "vehicle-7",
  "vehicle-8",
];
oldNumberingDraft.routes.forEach((route, index) => {
  route.vehicle_id = oldVehicleIds[index];
});
oldNumberingDraft.vehicles = [...oldNumberingDraft.vehicles].reverse();
const remappedVehicles = migratePlanDepots(oldNumberingDraft, plan);
assert.deepEqual(
  remappedVehicles.routes.map((route) => route.vehicle_id),
  oldVehicleIds,
  "existing vehicle choices should be preserved",
);
assert.deepEqual(
  getPlanVehicles(remappedVehicles).map((vehicle) => vehicle.name),
  [
    "Vehicle 1",
    "Vehicle 2",
    "Vehicle 3",
    "Vehicle 4",
    "Vehicle 5",
    "Vehicle 6",
    "Vehicle 7",
    "Vehicle 8",
    "Vehicle 9",
    "Vehicle 10",
  ],
  "the fleet should always be listed as Vehicle 1, 2, 3, ...",
);
assert.equal(remappedVehicles.vehicles_version, 2);

const customAssignmentDraft = structuredClone(plan);
customAssignmentDraft.routes[0].vehicle_id = "vehicle-9";
const preservedAssignment = migratePlanDepots(customAssignmentDraft, plan);
assert.equal(
  preservedAssignment.routes[0].vehicle_id,
  "vehicle-9",
  "after normalization, user vehicle choices should be preserved",
);

const invalidVehicleDraft = structuredClone(plan);
invalidVehicleDraft.routes[0].vehicle_id = "vehicle-nowhere";
assert.equal(
  migratePlanDepots(invalidVehicleDraft, plan).routes[0].vehicle_id,
  undefined,
  "migration should drop unknown vehicles",
);

const secondDraft = structuredClone(legacyDraft);
secondDraft.routes[0].depot_id = SECOND_DEPOT_ID;
const migratedSecondDraft = migratePlanDepots(secondDraft, plan);
assert.equal(
  migratedSecondDraft.routes[0].depot_id,
  SECOND_DEPOT_ID,
  "migration must preserve an explicit warehouse assignment",
);

// Drafts saved before rooms were introduced should inherit room counts.
const roomslessDraft = structuredClone(plan);
for (const route of roomslessDraft.routes) {
  for (const stop of route.stops) delete stop.rooms;
}
const migratedRoomsDraft = migratePlanDepots(roomslessDraft, plan);
assert.equal(
  migratedRoomsDraft.routes.reduce(
    (sum, route) =>
      sum + route.stops.reduce((child, stop) => child + (stop.rooms ?? 0), 0),
    0,
  ),
  3423,
  "migration should backfill room counts from the current plan",
);
assert.equal(
  computePlan(migratedRoomsDraft, matrix).totals.rooms,
  3423,
  "migrated drafts should compute the full room total",
);

// Drafts backfilled as 0 while the page served stale data should heal.
const zeroRoomsDraft = structuredClone(plan);
for (const route of zeroRoomsDraft.routes) {
  for (const stop of route.stops) stop.rooms = 0;
}
assert.equal(
  computePlan(migratePlanDepots(zeroRoomsDraft, plan), matrix).totals.rooms,
  3423,
  "migration should heal zeroed room counts from the current plan",
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

// ---------------------------------------------------------------------------
// New hotels added from the Plan Canvas
// ---------------------------------------------------------------------------

const newHotelInput = {
  name: "Test New Hotel",
  lat: 13.0,
  lon: 77.6,
  region: 2,
  service_mins: 10,
  load_bags: 5,
  rooms: 40,
};
const route7Before = plan.routes.find((route) => route.route_id === "103607");
assert.equal(route7Before.stops.length, 8);
const addedHotel = addNewHotelToRoute(plan, "103607", newHotelInput, matrix);
assert.equal(
  addedHotel.plan.routes.find((route) => route.route_id === "103607").stops
    .length,
  9,
  "the new hotel should be inserted once",
);
assert.equal(
  addedHotel.plan.routes.reduce((sum, route) => sum + route.stops.length, 0),
  102,
  "the plan should have one more stop",
);
assert.ok(
  addedHotel.stop.hotel_id.startsWith("custom-"),
  "new hotels should get a custom id",
);
assert.equal(addedHotel.stop.name, "Test New Hotel");
assert.equal(addedHotel.stop.lat, 13.0);
assert.equal(addedHotel.stop.lon, 77.6);
assert.equal(addedHotel.stop.region, 2);
assert.equal(addedHotel.stop.service_mins, 10);
assert.equal(addedHotel.stop.load_bags, 5);
assert.equal(addedHotel.stop.rooms, 40);
assert.equal(
  plan.routes.find((route) => route.route_id === "103607").stops.length,
  8,
  "adding a hotel must not mutate the original plan",
);

const computedWithHotel = computePlan(addedHotel.plan, matrix);
const route7Computed = computedWithHotel.routes.find(
  (route) => route.route_id === "103607",
);
assert.equal(route7Computed.total_bags, 31);
assert.equal(route7Computed.total_rooms, 232);
assert.ok(
  route7Computed.estimated_legs > 0,
  "a hotel outside the matrix should use estimated legs",
);
assert.equal(computedWithHotel.totals.hotels, 102);
assert.equal(computedWithHotel.totals.rooms, 3463);

const route7WithVehicle = assignVehicleToRoute(plan, "103607", "vehicle-8");
assert.throws(
  () =>
    addNewHotelToRoute(
      route7WithVehicle,
      "103607",
      { ...newHotelInput, load_bags: 50 },
      matrix,
    ),
  /vehicle limit/,
  "a new hotel that breaks the capacity should be blocked",
);
assert.throws(
  () =>
    addNewHotelToRoute(
      plan,
      "103607",
      { ...newHotelInput, lat: 999 },
      matrix,
    ),
  /Latitude/,
  "invalid coordinates should be blocked",
);

const secondHotel = addNewHotelToRoute(
  addedHotel.plan,
  "103607",
  newHotelInput,
  matrix,
);
assert.equal(
  secondHotel.stop.hotel_id,
  "custom-test-new-hotel-2",
  "duplicate hotel names should get unique ids",
);
assert.equal(
  secondHotel.plan.routes.find((route) => route.route_id === "103607").stops
    .length,
  10,
);

// ---------------------------------------------------------------------------
// Day board data
// ---------------------------------------------------------------------------

const dayViews = buildDayData(dayPlan, hotels);
assert.equal(dayViews.length, 3, "expected Day 0, Day 1 and Day 2");
assert.equal(dayViews[0].total, 28, "Day 0 should contain the daily hotels");
assert.equal(dayViews[0].unique, 28);
assert.equal(dayViews[1].total, 66, "Day 1 should contain the full list");
assert.equal(dayViews[1].dailyTotal, 28);
assert.equal(dayViews[1].alternativeTotal, 38);
assert.equal(dayViews[2].total, 62, "Day 2 should contain the full list");
assert.equal(dayViews[2].dailyTotal, 28);
assert.equal(dayViews[2].alternativeTotal, 34);
assert.deepEqual(dayViews[2].missing, ["UM Comforts"]);
const day1Route1 = dayViews[1].routes.find(
  (route) => route.routeId === "103501",
);
assert.equal(day1Route1.hotels.length, 7);
assert.equal(day1Route1.dailyCount, 4);
assert.equal(day1Route1.alternativeCount, 3);
const hyatt = day1Route1.hotels.find(
  (hotel) => hotel.name === "HYATT WHITEFIELD MAHADEVPURA",
);
assert.ok(hyatt, "expected the Hyatt alias to be present");
assert.ok(hyatt.lat !== null, "the Hyatt alias should resolve to coordinates");
assert.equal(hyatt.mappedName, "Hyatt Centric Whitefield Bengaluru");
const umComforts = dayViews[2].routes
  .find((route) => route.routeId === "103602")
  .hotels.find((hotel) => hotel.name === "UM Comforts");
assert.ok(umComforts);
assert.equal(umComforts.lat, null, "unmatched hotels should be unpinned");

// ---------------------------------------------------------------------------
// Shared plan validation
// ---------------------------------------------------------------------------

const planSummary = summarizePlan(plan);
assert.deepEqual(planSummary, {
  routes: 8,
  stops: 101,
  bags: 387,
  rooms: 3423,
  vehicles: 10,
  depots: 2,
  laundries: 2,
  customRoutes: 0,
  unassigned: 0,
});
const parsedPlan = parsePlanDraft(structuredClone(plan));
assert.equal(parsedPlan.plan_id, plan.plan_id);
assert.equal(parsedPlan.routes.length, 8);
assert.deepEqual(summarizePlan(parsedPlan), planSummary);
assert.equal(
  parsePlanDraft({ ...structuredClone(plan), exported_at: "2026-11-05T10:00:00.000Z" })
    .routes.length,
  8,
  "export wrapper fields should be ignored",
);
assert.throws(
  () => parsePlanDraft(null),
  /not a shared plan/,
  "empty files should be rejected",
);
assert.throws(
  () => parsePlanDraft({ ...structuredClone(plan), schema_version: 99 }),
  /Unsupported plan version/,
  "unknown plan versions should be rejected",
);
const invalidCoordinatePlan = structuredClone(plan);
invalidCoordinatePlan.routes[0].stops[0].lat = Number.NaN;
assert.throws(
  () => parsePlanDraft(invalidCoordinatePlan),
  /latitude/,
  "invalid hotel coordinates should be rejected",
);
const invalidStopsPlan = structuredClone(plan);
invalidStopsPlan.routes[0].stops = null;
assert.throws(
  () => parsePlanDraft(invalidStopsPlan),
  /stops/,
  "routes without stop lists should be rejected",
);

console.log("");
console.log("Warehouse assignment smoke test (Route 7, HQ -> Second Warehouse):");
console.log(
  `  drive ${hqComputed.total_drive_mins} min from HQ -> ${movedWarehouseComputed.total_drive_mins} min from WH2`,
);
console.log(
  `  distance ${hqComputed.total_dist_km} km -> ${movedWarehouseComputed.total_dist_km} km`,
);

console.log("");
console.log("Laundry smoke test (Route 1, direct -> Pioneer):");
console.log(
  `  return ${directComputed.return_hq} -> ${laundryComputed.return_hq}`,
);
console.log(
  `  distance ${directComputed.total_dist_km} km -> ${laundryComputed.total_dist_km} km`,
);
console.log(
  `  laundry ${laundryComputed.laundry_arrival_time} -> ${laundryComputed.laundry_departure_time} (${laundryComputed.laundry_service_mins} min)`,
);

console.log("");
console.log("Fleet inventory:");
console.log(
  `  ${vehicles.length} vehicles, ${plan.routes.length} routes, ${vehicles.filter((vehicle) => routesUsingVehicle(plan, vehicle.id).length === 0).length} spare`,
);
console.log(
  `  Vehicle 9 capacity 40 -> ${getPlanVehicles(shrunk).find((vehicle) => vehicle.id === "vehicle-9").nominal_cap} (${routesUsingVehicle(shrunk, "vehicle-9").length} route${routesUsingVehicle(shrunk, "vehicle-9").length === 1 ? "" : "s"} updated)`,
);

console.log("");
console.log("New hotel smoke test (Route 7 + Test New Hotel):");
console.log(
  `  stops 8 -> ${route7Computed.stops.length}, bags ${route7Before.stops.reduce((sum, stop) => sum + stop.load_bags, 0)} -> ${route7Computed.total_bags}, rooms 192 -> ${route7Computed.total_rooms}`,
);
console.log(`  estimated legs: ${route7Computed.estimated_legs}`);

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

const capacityPlan = assignVehicleToRoute(plan, "103501", "vehicle-1");
assert.throws(
  () => moveStop(capacityPlan, fountainTree.hotel_id, "103501", 0, matrix),
  /would exceed its 40-bag vehicle limit/,
  "moves into a route with insufficient capacity should be rejected",
);

const tightPlan = structuredClone(
  assignVehicleToRoute(plan, "103607", "vehicle-8"),
);
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
  capacity: 20,
  vehicle_id: "vehicle-4",
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
