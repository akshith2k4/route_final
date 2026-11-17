/**
 * Cross-tenant isolation test.
 *
 * Creates two complete cities (tenants) with their own regions, hotels,
 * facilities, vehicles, plans and datasets, then proves that every read,
 * write and delete scoped to city A can neither see nor touch city B.
 *
 * Run:
 *   npm run test:tenants
 *
 * It cleans up both cities afterwards (cascade), so it is safe to run against
 * the development database. HTTP checks run only when a dev server is up.
 */
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { db } from "../lib/db";
import {
  cities,
  cityDatasets,
  facilities,
  hotels,
  plans,
  regions,
  vehicles,
} from "../db/schema";
import {
  getCityDataset,
  getCityDatasets,
  getRegionMeta,
} from "../lib/cities";
import {
  deleteHotel,
  getCoverageHotels,
  getHotelAdminItems,
  getHotelRows,
  updateHotel,
  type HotelInput,
} from "../lib/hotels";
import {
  deleteVehicle,
  getVehicleAdminItems,
  getVehicleById,
  getVehicleRows,
  updateVehicle,
  type VehicleInput,
} from "../lib/vehicles";
import {
  deleteFacility,
  getFacilityAdminItems,
  getFacilityById,
  getFacilityRows,
  updateFacility,
  type FacilityInput,
} from "../lib/facilities";
import { getPlanById, listPlanSummaries } from "../lib/plan-store";
import { getCityContext } from "../lib/city-context";
import type { Plan } from "../lib/plan";

const RUN_ID = Date.now().toString(36);
const CITY_A = `zz-iso-a-${RUN_ID}`;
const CITY_B = `zz-iso-b-${RUN_ID}`;
const TEST_CITIES = [CITY_A, CITY_B];

let passed = 0;
let failed = 0;

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  \u2717 ${name}`);
    console.error(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function uniqueIds(items: { id: string }[]): string[] {
  return [...new Set(items.map((item) => item.id))];
}

function assertOnlyCity(
  items: { id: string; cityId?: string }[],
  expected: string[],
  label: string,
): void {
  const ids = uniqueIds(items);
  for (const id of ids) {
    assert.ok(expected.includes(id), `${label} leaked an unexpected row: ${id}`);
  }
  assert.equal(ids.length, expected.length, `${label} returned ${ids.length} rows, expected ${expected.length}`);
}

function planFor(cityId: string, depotId: string, hotelId: string): Plan {
  return {
    schema_version: 1,
    plan_id: `plan-${cityId}`,
    name: `Plan ${cityId}`,
    status: "draft",
    created_at: new Date().toISOString(),
    source: "tenant-isolation-test",
    depot: { id: depotId, name: `HQ ${cityId}`, lat: 18.52, lon: 73.86 },
    depots: [{ id: depotId, name: `HQ ${cityId}`, lat: 18.52, lon: 73.86 }],
    laundries: [],
    vehicles: [],
    vehicles_version: 2,
    days_version: 1,
    shift: { start_min: 7 * 60, end_min: 17 * 60 },
    routes: [
      {
        route_id: `route-${cityId}`,
        route_key: `route-${cityId}`,
        name: `Route ${cityId}`,
        color: "#2563EB",
        nominal_cap: 40,
        max_load: 36,
        departure_min: 7 * 60,
        stops: [
          {
            hotel_id: hotelId,
            name: `Hotel ${cityId}`,
            lat: 18.52,
            lon: 73.86,
            region: 0,
            service_mins: 15,
            load_bags: 3,
            days: ["day1", "day2"],
          },
        ],
      },
    ],
    unassigned_hotel_ids: [],
  };
}

async function seedTenant(slug: string, label: string) {
  const hotelId = `hotel-${slug}`;
  const depotId = `depot-${slug}`;
  const vehicleId = `vehicle-${slug}`;
  const planId = `plan-${slug}`;

  await db.insert(cities).values({
    id: slug,
    name: `Tenant ${label}`,
    displayName: `Tenant ${label} Urban`,
    centerLat: 18.52,
    centerLon: 73.86,
    timezone: "Asia/Kolkata",
    isActive: false,
    sortOrder: 999,
  });

  await db.insert(regions).values([
    {
      cityId: slug,
      regionIndex: 0,
      code: "R0",
      name: `${label} North`,
      shortName: `${label} North`,
      mapLabel: `${label} N`,
      color: "#0891B2",
      centerLat: 18.59,
      centerLon: 73.86,
      labelLat: 18.59,
      labelLon: 73.86,
      sortOrder: 0,
    },
    {
      cityId: slug,
      regionIndex: 1,
      code: "R1",
      name: `${label} South`,
      shortName: `${label} South`,
      mapLabel: `${label} S`,
      color: "#F59E0B",
      centerLat: 18.45,
      centerLon: 73.86,
      labelLat: 18.45,
      labelLon: 73.86,
      sortOrder: 1,
    },
  ]);

  await db.insert(facilities).values({
    cityId: slug,
    id: depotId,
    name: `${label} Warehouse`,
    shortName: `${label} WH`,
    address: `${label} address`,
    latitude: 18.52,
    longitude: 73.86,
    isWarehouse: true,
    isLaundry: false,
    serviceMins: 0,
    isActive: true,
  });

  await db.insert(vehicles).values({
    cityId: slug,
    id: vehicleId,
    name: `${label} Van`,
    realCapacity: 40,
    color: "#2563EB",
    regionId: 0,
    regionName: `${label} North`,
    sector: null,
    depotId,
    departureTime: "07:00",
    returnTime: "17:00",
    isActive: true,
  });

  await db.insert(hotels).values({
    cityId: slug,
    id: hotelId,
    name: `${label} Hotel`,
    address: `${label} hotel address`,
    latitude: 18.52,
    longitude: 73.86,
    regionName: `${label} North`,
    stopMins: 15,
    loadBags: 3,
    alternateLoadBags: 2,
    rooms: 20,
    dayPlan: "daily",
    isActive: true,
  });

  const plan = planFor(slug, depotId, hotelId);
  await db.insert(plans).values({
    id: planId,
    cityId: slug,
    name: plan.name,
    status: plan.status,
    data: plan,
    version: 1,
  });

  await db.insert(cityDatasets).values([
    {
      id: `${slug}:hex_map`,
      cityId: slug,
      kind: "hex_map",
      payload: { [`cell-${label}`]: 0 },
    },
    {
      id: `${slug}:baseline_plan`,
      cityId: slug,
      kind: "baseline_plan",
      payload: plan,
    },
    {
      id: `${slug}:manual_routes`,
      cityId: slug,
      kind: "manual_routes",
      payload: [],
    },
  ]);

  return { hotelId, depotId, vehicleId, planId };
}

async function httpJson(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const response = await fetch(`http://localhost:3000${path}`, init);
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function main() {
  console.log(`\nTenant isolation test (${RUN_ID})\n`);

  let serverUp = false;
  try {
    const probe = await fetch("http://localhost:3000/api/health", { signal: AbortSignal.timeout(2000) });
    serverUp = probe.ok || probe.status === 404;
  } catch {
    serverUp = false;
  }

  let a: Awaited<ReturnType<typeof seedTenant>>;
  let b: Awaited<ReturnType<typeof seedTenant>>;

  try {
    console.log("Seeding two tenants…");
    a = await seedTenant(CITY_A, "A");
    b = await seedTenant(CITY_B, "B");

    // ---------- Hotels ----------
    console.log("\nHotels");
    await check("getHotelAdminItems(A) returns only A", async () => {
      const rows = await getHotelAdminItems(CITY_A);
      assertOnlyCity(rows, [a.hotelId], "hotels admin A");
    });
    await check("getHotelAdminItems(B) returns only B", async () => {
      const rows = await getHotelAdminItems(CITY_B);
      assertOnlyCity(rows, [b.hotelId], "hotels admin B");
    });
    await check("getHotelRows(A) returns only A", async () => {
      const rows = await getHotelRows(CITY_A);
      assertOnlyCity(rows, [a.hotelId], "hotel rows A");
    });
    await check("getCoverageHotels(A) maps only A", async () => {
      const regionsA = await getRegionMeta(CITY_A);
      const rows = await getCoverageHotels(CITY_A, regionsA);
      assertOnlyCity(rows, [a.hotelId], "coverage hotels A");
      assert.equal(rows[0].region, 0, "A hotel should map to A's region index");
    });
    await check("updateHotel(A, B's hotel) is rejected", async () => {
      const input: HotelInput = {
        name: "Hijacked",
        address: null,
        latitude: 18.52,
        longitude: 73.86,
        regionName: "A North",
        stopMins: 15,
        loadBags: 3,
        alternateLoadBags: 2,
        rooms: 20,
        dayPlan: "daily",
      };
      const result = await updateHotel(CITY_A, b.hotelId, input);
      assert.equal(result, null, "cross-city update should return null");
      const rowsB = await getHotelAdminItems(CITY_B);
      assert.equal(rowsB[0].name, "B Hotel", "B's hotel must be unchanged");
    });
    await check("deleteHotel(A, B's hotel) is rejected", async () => {
      const deleted = await deleteHotel(CITY_A, b.hotelId);
      assert.equal(deleted, false, "cross-city delete should return false");
      const rowsB = await getHotelAdminItems(CITY_B);
      assert.equal(rowsB.length, 1, "B's hotel must still exist");
    });

    // ---------- Vehicles ----------
    console.log("\nVehicles");
    await check("getVehicleAdminItems(A) returns only A", async () => {
      const rows = await getVehicleAdminItems(CITY_A);
      assertOnlyCity(rows, [a.vehicleId], "vehicles admin A");
    });
    await check("getVehicleRows(A) returns only A", async () => {
      const rows = await getVehicleRows(CITY_A);
      assertOnlyCity(rows, [a.vehicleId], "vehicle rows A");
    });
    await check("getVehicleById(A, B's vehicle) is null", async () => {
      const result = await getVehicleById(CITY_A, b.vehicleId);
      assert.equal(result, null);
    });
    await check("updateVehicle(A, B's vehicle) is rejected", async () => {
      const input: VehicleInput = {
        name: "Hijacked Van",
        realCapacity: 40,
        color: "#000000",
        regionId: 0,
        regionName: "A North",
        sector: null,
        depotId: a.depotId,
        departureTime: "07:00",
        returnTime: "17:00",
        isActive: true,
      };
      const result = await updateVehicle(CITY_A, b.vehicleId, input);
      assert.equal(result, null);
      const rowsB = await getVehicleAdminItems(CITY_B);
      assert.equal(rowsB[0].name, "B Van", "B's vehicle must be unchanged");
    });
    await check("deleteVehicle(A, B's vehicle) is rejected", async () => {
      const deleted = await deleteVehicle(CITY_A, b.vehicleId);
      assert.equal(deleted, false);
      const rowsB = await getVehicleAdminItems(CITY_B);
      assert.equal(rowsB.length, 1, "B's vehicle must still exist");
    });

    // ---------- Facilities ----------
    console.log("\nFacilities");
    await check("getFacilityRows(A) returns only A", async () => {
      const rows = await getFacilityRows(CITY_A);
      assertOnlyCity(rows, [a.depotId], "facility rows A");
    });
    await check("getFacilityById(A, B's facility) is null", async () => {
      const result = await getFacilityById(CITY_A, b.depotId);
      assert.equal(result, null);
    });
    await check("updateFacility(A, B's facility) is rejected", async () => {
      const input: FacilityInput = {
        name: "Hijacked Warehouse",
        shortName: "HW",
        address: null,
        latitude: 18.52,
        longitude: 73.86,
        isWarehouse: true,
        isLaundry: false,
        serviceMins: 0,
        isActive: true,
      };
      const result = await updateFacility(CITY_A, b.depotId, input);
      assert.equal(result, null);
      const rowsB = await getFacilityRows(CITY_B);
      assert.equal(rowsB[0].name, "B Warehouse", "B's facility must be unchanged");
    });
    await check("deleteFacility(A, B's facility) is rejected", async () => {
      const deleted = await deleteFacility(CITY_A, b.depotId);
      assert.equal(deleted, false);
      const rowsB = await getFacilityRows(CITY_B);
      assert.equal(rowsB.length, 1, "B's facility must still exist");
    });
    await check("facility usage in A ignores B's plan and vehicle", async () => {
      const items = await getFacilityAdminItems(CITY_A);
      const depotA = items.find((item) => item.id === a.depotId);
      assert.ok(depotA, "A's depot should exist");
      assert.equal(depotA.usedByRouteCount, 1, "A's depot should count only A's route");
      assert.ok(
        !depotA.usedByPlans.includes(`Plan ${CITY_B}`),
        "A's depot must not list B's plan",
      );
    });

    // ---------- Plans ----------
    console.log("\nPlans");
    await check("listPlanSummaries(A) returns only A", async () => {
      const rows = await listPlanSummaries(CITY_A);
      assertOnlyCity(rows, [a.planId], "plan summaries A");
    });
    await check("getPlanById(A, B's plan) is null", async () => {
      const result = await getPlanById(CITY_A, b.planId);
      assert.equal(result, null);
    });
    await check("getPlanById(B, B's plan) still works", async () => {
      const result = await getPlanById(CITY_B, b.planId);
      assert.ok(result, "B's own plan must load");
      assert.equal(result!.plan.name, `Plan ${CITY_B}`);
    });

    // ---------- Regions ----------
    console.log("\nRegions");
    await check("getRegionMeta(A) returns only A's regions", async () => {
      const rows = await getRegionMeta(CITY_A);
      assert.deepEqual(
        rows.map((region) => region.name).sort(),
        ["A North", "A South"],
      );
    });

    // ---------- Datasets + cache ----------
    console.log("\nDatasets and cache");
    await check("getCityDataset(A, hex_map) returns A's payload", async () => {
      const payload = await getCityDataset<Record<string, number>>(CITY_A, "hex_map");
      assert.deepEqual(payload, { "cell-A": 0 });
    });
    await check("dataset cache does not bleed A into B", async () => {
      const payloadA = await getCityDataset<Record<string, number>>(CITY_A, "hex_map");
      const payloadB = await getCityDataset<Record<string, number>>(CITY_B, "hex_map");
      assert.deepEqual(payloadA, { "cell-A": 0 });
      assert.deepEqual(payloadB, { "cell-B": 0 });
    });
    await check("getCityDatasets(A) contains only A's keys", async () => {
      const datasets = await getCityDatasets(CITY_A);
      const serialized = JSON.stringify(datasets);
      assert.ok(serialized.includes("cell-A"));
      assert.ok(!serialized.includes("cell-B"), "A's datasets leaked B's payload");
    });

    // ---------- City context ----------
    console.log("\nCity context");
    await check("getCityContext(A) is scoped to A", async () => {
      const context = await getCityContext(CITY_A);
      assert.ok(context, "A context should load");
      assertOnlyCity(context!.hotels, [a.hotelId], "context hotels A");
      assert.deepEqual(
        context!.depots.map((depot) => depot.id),
        [a.depotId],
        "context depots should be A only",
      );
      assert.deepEqual(
        context!.vehicles.map((vehicle) => vehicle.label),
        ["A Van"],
        "context vehicles should be A only",
      );
      assert.equal(context!.baselinePlan?.name, `Plan ${CITY_A}`);
      assert.deepEqual(context!.manualRoutes, [], "A has no manual routes");
    });

    // ---------- HTTP API ----------
    if (serverUp) {
      console.log("\nHTTP API");
      await check("GET /api/A/hotels returns only A", async () => {
        const { status, body } = await httpJson(`/api/${CITY_A}/hotels`);
        assert.equal(status, 200);
        assertOnlyCity(body.hotels, [a.hotelId], "API hotels A");
      });
      await check("GET /api/A/vehicles returns only A", async () => {
        const { status, body } = await httpJson(`/api/${CITY_A}/vehicles`);
        assert.equal(status, 200);
        assertOnlyCity(body.vehicles, [a.vehicleId], "API vehicles A");
      });
      await check("GET /api/A/facilities returns only A", async () => {
        const { status, body } = await httpJson(`/api/${CITY_A}/facilities`);
        assert.equal(status, 200);
        assertOnlyCity(body.facilities, [a.depotId], "API facilities A");
      });
      await check("GET /api/A/plans/B's-plan returns 404", async () => {
        const { status } = await httpJson(`/api/${CITY_A}/plans/${b.planId}`);
        assert.equal(status, 404);
      });
      await check("DELETE /api/A/hotels/B's-hotel returns 404", async () => {
        const { status } = await httpJson(`/api/${CITY_A}/hotels/${b.hotelId}`, {
          method: "DELETE",
        });
        assert.equal(status, 404);
      });
      await check("GET /api/admin/cities/A returns only A's regions", async () => {
        const { status, body } = await httpJson(`/api/admin/cities/${CITY_A}`);
        assert.equal(status, 200);
        assert.deepEqual(
          body.regions.map((region: { name: string }) => region.name).sort(),
          ["A North", "A South"],
        );
      });
    } else {
      console.log("\nHTTP API\n  (skipped — dev server not reachable on :3000)");
    }
  } finally {
    console.log("\nCleaning up test tenants…");
    await db.delete(cities).where(inArray(cities.id, TEST_CITIES));
    const leftovers = await db
      .select({ id: cities.id })
      .from(cities)
      .where(inArray(cities.id, TEST_CITIES));
    console.log(`  Removed ${TEST_CITIES.length - leftovers.length}/${TEST_CITIES.length} test cities`);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exitCode = 1;
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Tenant isolation test crashed:", error);
  process.exit(1);
});
