import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";

export async function POST(req: NextRequest) {
  try {
    let tokenId: number;
    let supplier: string;
    let buyerName: string;
    let amount: number;
    let dueDate: number; // Unix timestamp
    let ipfsHash: string;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      tokenId = parseInt(formData.get("token_id") as string);
      supplier = (formData.get("supplier") as string) || "";
      buyerName = (formData.get("buyer_name") as string) || "";
      amount = parseFloat(formData.get("amount") as string) || 0;
      dueDate = parseInt(formData.get("due_date") as string) || 0;
      ipfsHash = (formData.get("ipfs_hash") as string) || "";
    } else {
      const body = await req.json();
      tokenId = parseInt(body.token_id);
      supplier = body.supplier || "";
      buyerName = body.buyer_name || "";
      amount = parseFloat(body.amount) || 0;
      dueDate = parseInt(body.due_date) || 0;
      ipfsHash = body.ipfs_hash || "";
    }

    // Format due_date timestamp back to readable string for dashboard view
    const dateStr = new Date(dueDate * 1000).toISOString().split('T')[0];

    const success = db.addInvoice({
      token_id: tokenId,
      supplier: supplier.toLowerCase(),
      buyer_name: buyerName,
      amount: amount,
      due_date: dateStr,
      ipfs_hash: ipfsHash,
      status: "Pending",
      currency: "mAED" // Default currency matching dashboard
    });

    if (!success) {
      return NextResponse.json({ error: "Invoice already exists" }, { status: 400 });
    }

    return NextResponse.json({ success: true, token_id: tokenId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
