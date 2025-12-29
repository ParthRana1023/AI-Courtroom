import GavelLoader from "@/components/gavel-loader";

export default function Loading() {
  return (
    <div className="grow flex items-center justify-center min-h-[50vh]">
      <GavelLoader message="Loading..." />
    </div>
  );
}
