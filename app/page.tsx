import { redirect } from "next/navigation";
import { getDefaultCity } from "../lib/cities";

export const dynamic = "force-dynamic";

/**
 * The app is city-scoped, so the root path hands over to the first active
 * city. A deployment with several cities still opens on the default one, and
 * every city keeps its own shareable URL.
 */
export default async function Home() {
  const city = await getDefaultCity();

  if (!city) {
    return (
      <main
        style={{
          padding: "48px 24px",
          fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
        }}
      >
        <h1>No cities configured</h1>
        <p>
          Run <code>npm run db:seed:city -- bengaluru</code> to publish the
          first city.
        </p>
      </main>
    );
  }

  redirect(`/${city.id}`);
}
