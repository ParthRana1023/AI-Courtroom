import GavelLoader from "@/components/gavel-loader";

export default function Loading() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[50vh]">
      <GavelLoader message="Loading parties details..." />
    </div>
  );
}
