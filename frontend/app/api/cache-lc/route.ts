import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";

export async function POST(req: NextRequest) {
  try {
    let lcId: number;
    let importer: string;
    let exporter: string;
    let amount: number;
    let dueDate: number; // Unix timestamp
    let documentHash: string;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      lcId = parseInt(formData.get("lc_id") as string);
      importer = (formData.get("importer") as string) || "";
      exporter = (formData.get("exporter") as string) || "";
      amount = parseFloat(formData.get("amount") as string) || 0;
      dueDate = parseInt(formData.get("due_date") as string) || 0;
      documentHash = (formData.get("document_hash") as string) || "";
    } else {
      const body = await req.json();
      lcId = parseInt(body.lc_id);
      importer = body.importer || "";
      exporter = body.exporter || "";
      amount = parseFloat(body.amount) || 0;
      dueDate = parseInt(body.due_date) || 0;
      documentHash = body.document_hash || "";
    }

    const dateStr = new Date(dueDate * 1000).toISOString().split('T')[0];

    const success = db.addLc({
      id: lcId,
      lc_id: lcId,
      importer: importer.toLowerCase(),
      exporter: exporter.toLowerCase(),
      amount: amount,
      due_date: dateStr,
      document_hash: documentHash,
      shipment_proof: "",
      status: "Created"
    });

    if (!success) {
      return NextResponse.json({ error: "LC already exists" }, { status: 400 });
    }

    return NextResponse.json({ success: true, lc_id: lcId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
