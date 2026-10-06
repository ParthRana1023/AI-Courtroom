"use client";

import { useEffect } from "react";
import DeskPage from "@/components/chrome/desk-page";
import { ErrorSheet } from "@/components/chrome/error-screen";
import { getLogger } from "@/lib/logger";

const logger = getLogger("error");

export default function RouteError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    logger.error("Route crashed", error, { digest: error.digest });
  }, [error]);

  return (
    <DeskPage>
      <ErrorSheet />
    </DeskPage>
  );
}
