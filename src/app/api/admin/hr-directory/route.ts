import { NextResponse } from "next/server";
import { fetchHrEmployeeDirectory } from "@/lib/hr-directory-client";
import { getVerifiedFleetUser, isFleetManagementRole } from "@/lib/server-auth";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user || !isFleetManagementRole(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const country = new URL(request.url).searchParams.get("country") || undefined;
  const result = await fetchHrEmployeeDirectory({ country });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result);
}
