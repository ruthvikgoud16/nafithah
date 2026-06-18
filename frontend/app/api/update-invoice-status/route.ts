import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";

export async function POST(req: NextRequest) {
  try {
    let tokenId: number;
    let status: any;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      tokenId = parseInt(formData.get("token_id") as string);
      status = formData.get("status") as string;
    } else {
      const body = await req.json();
      tokenId = parseInt(body.token_id);
      status = body.status;
    }

    const success = db.updateInvoiceStatus(tokenId, status);
    if (!success) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
