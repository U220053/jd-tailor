import { NextRequest, NextResponse } from "next/server";
import puppeteerCore from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import { writeFile } from "fs/promises";
import path from "path";

async function getBrowser() {
  if (process.env.VERCEL) {
    const executablePath = await chromium.executablePath(
      "https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar"
    );
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

  const browser = await getBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: { top: "20px", bottom: "20px", left: "20px", right: "20px" },
    });

    const filename = `resume-${Date.now()}.pdf`;
    const filepath = path.join(process.cwd(), "public", "downloads", filename);
    await writeFile(filepath, pdfBuffer);

    return NextResponse.json({ downloadUrl: `/downloads/${filename}` });
  } finally {
    await browser.close();
  }
}
