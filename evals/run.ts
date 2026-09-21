/**
 * Eval suite — run before any prompt change.
 *
 *   npm run eval
 *
 * Loads every case in evals/cases/*.json, tailors the resume to the JD, and
 * measures two things:
 *   - schemaAndGuardPassRate: fraction of cases that produced a schema-valid
 *     output with no fabricated skills AND cleared the coverage bar.
 *   - avgCoverage: mean JD-keyword coverage across all cases.
 *
 * Requires GEMINI_API_KEY in the environment.
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Unlike Next.js, tsx does not auto-load .env — do it ourselves. This must run
// before lib/schema is imported (it constructs the Gemini client from the key),
// so the schema module is pulled in via dynamic import inside main().
for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) process.loadEnvFile(f);
}

interface EvalCase {
  name: string;
  resume: string;
  jd: string;
  jdKeywords: string[];
}

const COVERAGE_BAR = 0.7;

const casesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "cases");

function loadCases(): EvalCase[] {
  return readdirSync(casesDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(casesDir, f), "utf8")));
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set — add it to .env or .env.local.");
    process.exit(1);
  }

  // Imported here (not at top of file) so .env is loaded before the Gemini
  // client is constructed.
  const { buildPrompt, generateTailored, keywordCoverage } = await import(
    "../lib/schema"
  );

  const cases = loadCases();
  let pass = 0;
  let total = 0;
  let coverageSum = 0;

  for (const c of cases) {
    total++;
    try {
      const out = await generateTailored(buildPrompt(c.resume, c.jd), c.resume);
      const cov = keywordCoverage(out, c.jdKeywords);
      coverageSum += cov;
      const ok = cov >= COVERAGE_BAR;
      if (ok) pass++;
      console.log(
        `${ok ? "PASS" : "FAIL"}  ${c.name.padEnd(34)} coverage=${(cov * 100).toFixed(0)}%`
      );
    } catch (e) {
      console.log(`ERROR ${c.name.padEnd(34)} ${(e as Error).message}`);
    }
  }

  const summary = {
    total,
    pass,
    schemaAndGuardPassRate: +(pass / total).toFixed(3),
    avgCoverage: +(coverageSum / total).toFixed(3),
  };
  console.log("\n" + JSON.stringify(summary, null, 2));

  // Non-zero exit if fewer than 70% of cases pass, so it can gate CI.
  if (pass / total < COVERAGE_BAR) process.exit(1);
}

main();
