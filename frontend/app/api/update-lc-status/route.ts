import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";

export async function POST(req: NextRequest) {
  try {
    let lcId: number;
    let status: any;
    let shipmentProof: string | undefined = undefined;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      lcId = parseInt(formData.get("lc_id") as string);
      status = formData.get("status") as string;
      shipmentProof = (formData.get("shipment_proof") as string) || undefined;
    } else {
      const body = await req.json();
      lcId = parseInt(body.lc_id);
      status = body.status;
      shipmentProof = body.shipment_proof || undefined;
    }

    const success = db.updateLcStatus(lcId, status, shipmentProof);
    if (!success) {
      return NextResponse.json({ error: "LC not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
