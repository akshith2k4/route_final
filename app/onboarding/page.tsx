import OnboardingWizard from "../../components/onboarding-wizard";

export const metadata = {
  title: "Region Architect & Onboarding Lab · LinenGrass Fleet Atlas",
  description:
    "Evaluate multi-count regional territory partitions (K-Means, Silhouette, Logistics Balance, H3 Hexagons) and onboard new operating cities for LinenGrass fleet operations.",
};

export default function OnboardingPage() {
  return <OnboardingWizard initialCityId="bengaluru" />;
}
