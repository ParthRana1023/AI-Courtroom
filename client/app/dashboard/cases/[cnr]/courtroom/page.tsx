import Courtroom from "./client";

export default function CaseCourtroomPage({
  params,
}: {
  params: Promise<{ cnr: string }>;
}) {
  return <Courtroom params={params} />;
}
