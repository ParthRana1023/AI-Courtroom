import CasePrepPage from "./client";

export default function CasePrepRoutePage({
  params,
}: {
  params: Promise<{ cnr: string }>;
}) {
  return <CasePrepPage params={params} />;
}
