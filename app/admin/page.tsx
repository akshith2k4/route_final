import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, Plus } from "lucide-react";
import { listAllCitiesWithCounts } from "../../lib/admin-cities";
import DeleteCityButton from "../../components/admin/delete-city-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cities · LinenGrass Admin",
  description: "Onboard and manage LinenGrass operating cities.",
};

export default async function AdminCitiesPage() {
  const cities = await listAllCitiesWithCounts();

  return (
    <div className="flex min-h-[100svh] flex-col bg-bone">
      <header className="sticky top-0 z-40 flex h-[62px] shrink-0 items-center justify-between gap-4 border-b border-line bg-[#f7f3eb]/95 px-5 backdrop-blur-md">
        <Link href="/admin" className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink text-cream">
            <MapPin size={15} />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[15px] font-semibold tracking-tight text-ink">
              LinenGrass
            </span>
            <span className="text-[8.5px] font-semibold uppercase tracking-[0.14em] text-faint">
              Admin · City onboarding
            </span>
          </span>
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-line-strong px-3 py-1.5 text-[11px] font-semibold text-ink-soft transition-colors hover:bg-bone"
        >
          Back to app
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[1000px] flex-1 px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.145em] text-muted">
              Operations · Admin
            </p>
            <h1 className="mt-1 font-serif text-[36px] leading-none text-ink">Cities</h1>
            <p className="mt-2 max-w-[520px] text-[12.5px] leading-relaxed text-muted">
              Every operating city, plus drafts created by the onboarding wizard.
              Drafts stay out of the live switcher until they are published.
            </p>
          </div>
          <Link
            href="/admin/cities/new"
            className="flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2.5 text-[12px] font-semibold text-cream transition-opacity hover:opacity-90"
          >
            <Plus size={14} />
            New city
          </Link>
        </div>

        <div className="mt-4 rounded-xl border border-line-strong bg-paper px-4 py-3 text-[11.5px] leading-relaxed text-muted">
          <b className="text-ink">Full in-app onboarding:</b> a new city starts with{" "}
          <b className="text-ink">five standard zones</b> (North, South, East, West, Central)
          around its centre. The wizard then covers{" "}
          <b className="text-ink">region editing</b>, <b className="text-ink">hotel CSV import</b>,{" "}
          <b className="text-ink">fleet setup</b>, <b className="text-ink">dataset generation</b>{" "}
          and <b className="text-ink">activation</b> — no offline scripts.
        </div>

        <ul className="mt-5 flex flex-col gap-3">
          {cities.map((city) => (
            <li
              key={city.id}
              className="rounded-2xl border border-line bg-paper p-4 transition-colors hover:border-line-strong"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] ${
                    city.isActive
                      ? "bg-green-soft text-green"
                      : "bg-bone text-muted border border-line-strong"
                  }`}
                >
                  {city.isActive ? "Active" : "Draft"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-ink">
                    {city.name}
                    {city.displayName ? (
                      <span className="ml-2 text-[11px] font-medium text-faint">
                        {city.displayName}
                      </span>
                    ) : null}
                  </p>
                  <p className="font-mono text-[10.5px] text-faint">/{city.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/${city.id}`}
                    className="rounded-lg border border-line-strong px-3 py-1.5 text-[11px] font-semibold text-ink transition-colors hover:bg-bone"
                  >
                    Open
                  </Link>
                  {!city.isActive && <DeleteCityButton cityId={city.id} cityName={city.name} />}
                </div>
              </div>
              <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-[11px]">
                <Count label="Regions" value={city.counts.regions} />
                <Count label="Hotels" value={city.counts.hotels} />
                <Count label="Vehicles" value={city.counts.vehicles} />
                <Count label="Facilities" value={city.counts.facilities} />
                <Count label="Plans" value={city.counts.plans} />
                <Count label="Timezone" value={city.timezone} isText />
              </dl>
            </li>
          ))}
        </ul>

        {cities.length === 0 && (
          <p className="mt-8 rounded-2xl border border-dashed border-line-strong p-8 text-center text-[12.5px] text-muted">
            No cities yet. Create the first one with the wizard.
          </p>
        )}
      </main>
    </div>
  );
}

function Count({
  label,
  value,
  isText = false,
}: {
  label: string;
  value: number | string;
  isText?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-[9px] font-bold uppercase tracking-[0.1em] text-faint">{label}</dt>
      <dd className={`font-semibold text-ink ${isText ? "text-[10.5px]" : "font-mono"}`}>
        {value}
      </dd>
    </div>
  );
}
