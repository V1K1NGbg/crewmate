import { NextResponse } from "next/server";
import { getInstalledFeatures } from "@/lib/features.server";

export async function GET() {
  return NextResponse.json({ features: getInstalledFeatures() });
}
