import CaseDetails from "./client";

export default function CaseDetailsPage({
  params,
}: {
  params: Promise<{ cnr: string }>;
}) {
  return <CaseDetails params={params} />;
}
