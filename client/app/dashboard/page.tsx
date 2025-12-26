"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to cases page
    router.replace("/dashboard/profile");
  }, [router]);

  return null;
}
