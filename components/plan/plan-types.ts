import type { Plan, PlanRoute, PlanView } from "../../lib/plan";

export type PlanMode = "plan" | "warehouse";

export type SaveState = "saved" | "saving" | "error";

export type DropTarget = {
  routeId: string;
  index: number | null;
};

export type DragState = {
  hotelId: string;
  sourceRouteId: string;
};

export type Toast = {
  message: string;
  tone: "info" | "error";
};

export function shortRouteName(name: string): string {
  return name.replace(/\s*\(ID:[^)]*\)\s*$/, "").trim();
}

export function routeSignature(route: PlanRoute): string {
  return [
    route.depot_id ?? "",
    route.laundry_id ?? "",
    ...route.stops.map((stop) => stop.hotel_id),
  ].join("|");
}

export function changedRouteIds(previous: Plan, next: Plan): string[] {
  const ids = new Set([
    ...previous.routes.map((route) => route.route_id),
    ...next.routes.map((route) => route.route_id),
  ]);

  return [...ids].filter((id) => {
    const before = previous.routes.find((route) => route.route_id === id);
    const after = next.routes.find((route) => route.route_id === id);
    if (!before || !after) return true;
    return routeSignature(before) !== routeSignature(after);
  });
}

export function capacityTone(bags: number, route: PlanRoute): "ok" | "warn" | "over" {
  if (bags > route.nominal_cap) return "over";
  if (bags > route.max_load) return "warn";
  return "ok";
}

export const ROUTE_WARNING_CODES = new Set([
  "over_nominal_capacity",
  "over_safe_capacity",
  "shift_overrun",
]);

export const DAY_VIEW_OPTIONS: { key: PlanView; label: string }[] = [
  { key: "all", label: "All" },
  { key: "daily", label: "Daily" },
  { key: "day1", label: "Day 1" },
  { key: "day2", label: "Day 2" },
];

export function formatKm(value: number): string {
  return `${value.toFixed(1)} km`;
}

export function formatBags(value: number): string {
  return `${value} bag${value === 1 ? "" : "s"}`;
}

export function formatRooms(value: number): string {
  return `${value} room${value === 1 ? "" : "s"}`;
}

