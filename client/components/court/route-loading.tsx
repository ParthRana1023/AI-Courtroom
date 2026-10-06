import CourtModelLoader from "./court-model-loader";

/** Body of every loading.tsx: the 3D loader centred on the desk. */
export default function RouteLoading({ status }: { status?: string }) {
  return (
    <div className="flex min-h-[60dvh] flex-1 items-center justify-center px-3 py-6">
      <CourtModelLoader status={status} />
    </div>
  );
}
