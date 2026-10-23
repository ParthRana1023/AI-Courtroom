import HearingPage from "./client";

export default function SettlementHearingRoutePage({ params }: { params: Promise<{ cnr: string }> }) {
  return <HearingPage params={params} />;
}
