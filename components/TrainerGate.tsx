"use client";

import dynamic from "next/dynamic";

const TrainerApp = dynamic(() => import("@/components/TrainerApp"), { ssr: false });

export default function TrainerGate() {
  return <TrainerApp />;
}
