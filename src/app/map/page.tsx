"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const FleetMap = dynamic(() => import("@/components/FleetMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-96">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  ),
});

export default function MapPage(): React.ReactElement {
  const router = useRouter();

  return (
    <div className="h-[calc(100vh-8rem)]">
      <FleetMap onVehicleClick={(id) => router.push(`/vehicles/${id}`)} />
    </div>
  );
}
