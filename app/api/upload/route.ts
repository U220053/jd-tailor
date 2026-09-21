import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("resume") as File;

    if (!file)
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    // Extract text with pdfjs-dist directly. We deliberately avoid pdf-parse:
    // it pulls in @napi-rs/canvas (a native binary) that fails to load on
    // Vercel at import time, crashing the whole route. pdfjs's text-extraction
    // path is pure JS and needs no canvas. The legacy build is Node-friendly.
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
    }).promise;

    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text +=
        content.items
          .map((it) => ("str" in it ? it.str : ""))
          .join(" ") + "\n";
    }

    return NextResponse.json({ text });
  } catch (err) {
    // Return JSON (not an HTML 500) so the client can surface a real message.
    const e = err as Error;
    return NextResponse.json(
      { error: "Failed to parse PDF", name: e.name, detail: e.message },
      { status: 500 }
    );
  }
}
