import SettlementPage from "./client";

export default function SettlementRoutePage({ params }: { params: Promise<{ cnr: string }> }) {
  return <SettlementPage params={params} />;
}
