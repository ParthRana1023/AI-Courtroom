import ScalesLoader from "@/components/scales-loader";

export default function Loading() {
  return (
    <div className="grow flex items-center justify-center min-h-[50vh]">
      <ScalesLoader message="Loading your profile..." />
    </div>
  );
}
