import { redirect } from "next/navigation";

/** The settlement hearing is held in the courtroom; older links land there. */
export default async function SettlementHearingRoutePage({ params }: { params: Promise<{ cnr: string }> }) {
  const { cnr } = await params;
  redirect(`/cases/${cnr}/courtroom`);
}
