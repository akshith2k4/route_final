"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronDown } from "lucide-react";

export type CitySwitcherOption = {
  id: string;
  name: string;
};

/**
 * Switches between the cities a deployment runs. The current path is kept,
 * so moving from `/bengaluru/plan` lands on `/delhi/plan`.
 */
export default function CitySwitcher({
  cities,
  currentCityId,
  className = "",
}: {
  cities: CitySwitcherOption[];
  currentCityId: string;
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(nextCityId: string) {
    if (nextCityId === currentCityId) return;

    const segments = (pathname ?? "").split("/").filter(Boolean);
    if (segments.length === 0) {
      router.push(`/${nextCityId}`);
      return;
    }
    segments[0] = nextCityId;

    startTransition(() => {
      router.push(`/${segments.join("/")}`);
    });
  }

  if (cities.length < 2) {
    return null;
  }

  const current = cities.find((city) => city.id === currentCityId);

  return (
    <label
      className={`city-switcher ${className}`.trim()}
      data-pending={pending ? "true" : "false"}
      title="Switch city"
    >
      <span className="city-switcher__label">City</span>
      <span className="city-switcher__control">
        <select
          className="city-switcher__select"
          value={currentCityId}
          onChange={(event) => onChange(event.target.value)}
          aria-label="Select city"
        >
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </select>
        <ChevronDown
          className="city-switcher__chevron"
          aria-hidden="true"
          size={13}
          strokeWidth={2}
        />
      </span>
      <span className="sr-only">{current?.name ?? currentCityId}</span>
    </label>
  );
}
