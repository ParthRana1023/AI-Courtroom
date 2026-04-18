import PartiesPage from "./client";

export default function CasePartiesPage({
  params,
}: {
  params: Promise<{ cnr: string }>;
}) {
  return <PartiesPage params={params} />;
}
