import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("resume") as File;

    if (!file)
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    const buffer = new Uint8Array(await file.arrayBuffer());

    // unpdf wraps a serverless-ready pdfjs build with the DOM polyfills
    // (DOMMatrix, etc.) bundled in — so it runs on Vercel's Node runtime with
    // no native canvas binary, unlike pdf-parse / raw pdfjs-dist.
    const pdf = await getDocumentProxy(buffer);
    const { text } = await extractText(pdf, { mergePages: true });

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
