import { NextRequest, NextResponse } from "next/server";
import puppeteerCore from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

// The pack version MUST match the installed @sparticuz/chromium-min major
// (currently 149); a mismatch fails to launch. Vercel runs x64.
const CHROMIUM_PACK =
  "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

async function getBrowser() {
  if (process.env.VERCEL) {
    const executablePath = await chromium.executablePath(CHROMIUM_PACK);
    return puppeteerCore.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });
  }
  // Local dev: use the full puppeteer's bundled Chromium
  const { default: puppeteer } = await import("puppeteer");
  return puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildResumeHTML(data: any): string {
  const experienceHTML =
    data.experience
      ?.map(
        (exp: any) => `
    <div class="entry">
      <div class="entry-header">
        <span class="entry-title">${esc(exp.role ?? "")} — ${esc(
          exp.company ?? ""
        )}</span>
        <span class="entry-date">${esc(exp.duration ?? "")}</span>
      </div>
      <ul>
        ${exp.bullets?.map((b: string) => `<li>${esc(b)}</li>`).join("") ?? ""}
      </ul>
    </div>
  `
      )
      .join("") ?? "";

  const projectsHTML =
    data.projects
      ?.map(
        (proj: any) => `
    <div class="entry">
      <div class="entry-header">
        <span class="entry-title">${esc(proj.name ?? "")}</span>
        <span class="entry-date">${esc(proj.tech ?? "")}</span>
      </div>
      <ul>
        ${proj.bullets?.map((b: string) => `<li>${esc(b)}</li>`).join("") ?? ""}
      </ul>
    </div>
  `
      )
      .join("") ?? "";

  const achievementsHTML =
    data.achievements
      ?.map((a: string) => `<li>${esc(a)}</li>`)
      .join("") ?? "";

  const educationHTML =
    data.education
      ?.map(
        (ed: any) => `
    <div class="entry">
      <div class="entry-header">
        <span class="entry-title">${esc(ed.school ?? "")}</span>
        <span class="entry-date">${esc(ed.year ?? "")}</span>
      </div>
      <p style="margin:2px 0 0 0; font-size:13px;">${esc(ed.degree ?? "")}${
          ed.grade ? ` — ${esc(ed.grade)}` : ""
        }</p>
    </div>
  `
      )
      .join("") ?? "";

  const contact = [
    data.contact?.email,
    data.contact?.phone,
    data.contact?.linkedin,
    data.contact?.github,
  ]
    .filter(Boolean)
    .join(" | ");

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Georgia', serif; font-size: 13px; color: #111; padding: 40px 50px; line-height: 1.5; }
  h1 { font-size: 24px; text-align: center; letter-spacing: 1px; }
  .contact { text-align: center; font-size: 12px; color: #444; margin: 6px 0 18px; }
  .section-title {
    font-size: 13px; font-weight: bold; text-transform: uppercase;
    letter-spacing: 1px; border-bottom: 1px solid #111;
    margin: 16px 0 8px; padding-bottom: 2px;
  }
  .entry { margin-bottom: 10px; }
  .entry-header { display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; }
  .entry-date { font-weight: normal; font-size: 12px; color: #444; }
  ul { padding-left: 18px; margin-top: 4px; }
  li { margin-bottom: 3px; font-size: 12.5px; }
  .skills { font-size: 12.5px; }
</style>
</head>
<body>
  <h1>${esc(data.name ?? "Resume")}</h1>
  <div class="contact">${esc(contact)}</div>

  <div class="section-title">Experience</div>
  ${experienceHTML}

  <div class="section-title">Skills</div>
  <div class="skills">${esc(data.skills?.join(", ") ?? "")}</div>

  ${projectsHTML ? `<div class="section-title">Projects</div>${projectsHTML}` : ""}

  ${achievementsHTML ? `<div class="section-title">Achievements</div><ul>${achievementsHTML}</ul>` : ""}

  <div class="section-title">Education</div>
  ${educationHTML}
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const html = buildResumeHTML(data);

  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: { top: "20px", bottom: "20px", left: "20px", right: "20px" },
    });

    // Return the PDF inline as a data: URL. Vercel's filesystem is read-only
    // (except /tmp, which isn't web-served), so we never write to disk — the
    // <a href download> in the client consumes the data URL directly.
    const base64 = Buffer.from(pdfBuffer).toString("base64");
    return NextResponse.json({
      downloadUrl: `data:application/pdf;base64,${base64}`,
    });
  } catch (err) {
    // Return JSON (not an HTML 500) so the client can surface a real message.
    return NextResponse.json(
      { error: "PDF generation failed", detail: (err as Error).message },
      { status: 500 }
    );
  } finally {
    await browser?.close();
  }
}
