import { NextRequest, NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("resume") as File;

    if (!file)
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buffer });
    const { text } = await parser.getText();

    return NextResponse.json({ text });
  } catch (err) {
    // Return JSON (not an HTML 500) so the client shows a real message, and
    // include the underlying error so we can diagnose runtime/bundling issues.
    const e = err as Error;
    return NextResponse.json(
      { error: "Failed to parse PDF", name: e.name, detail: e.message },
      { status: 500 }
    );
  }
}
