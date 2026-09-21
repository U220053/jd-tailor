"use client";

import { useState } from "react";

interface Experience {
  company: string;
  role: string;
  duration: string;
  bullets: string[];
}

interface Project {
  name: string;
  tech: string;
  bullets: string[];
}

interface TailorResult {
  applicationId: number;
  name: string;
  contact: { phone: string; email: string; linkedin: string; github: string };
  experience: Experience[];
  projects: Project[];
  achievements: string[];
  skills: string[];
  education: { school: string; degree: string; year: string; grade: string }[];
  relevanceNotes: string;
}

const STEPS = {
  idle: { label: "", pct: 0 },
  fetching: { label: "Agent fetching & scoring the job posting...", pct: 30 },
  tailoring: { label: "Parsing resume & tailoring with AI...", pct: 60 },
  generating: { label: "Generating PDF...", pct: 90 },
  done: { label: "Done!", pct: 100 },
};

export default function Home() {
  const [jobDescription, setJobDescription] = useState("");
  const [jdUrl, setJdUrl] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [result, setResult] = useState<TailorResult | null>(null);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<keyof typeof STEPS>("idle");
  const [error, setError] = useState("");
  const [missing, setMissing] = useState<string[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resumeFile) return;
    if (!jobDescription.trim() && !jdUrl.trim()) {
      setError("Paste a job description or provide a job-posting URL.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setDownloadUrl("");
    setMissing([]);

    try {
      const formData = new FormData();
      formData.append("resume", resumeFile);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || "Failed to parse resume PDF");

      // If a URL was given, let the tool-use agent fetch & score the JD first.
      let jd = jobDescription;
      if (jdUrl.trim()) {
        setStep("fetching");
        const agentRes = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: jdUrl, resumeText: uploadData.text }),
        });
        const agentData = await agentRes.json();
        if (!agentRes.ok) throw new Error(agentData.error || "Agent failed to fetch the JD");
        if (agentData.jobDescription) {
          jd = agentData.jobDescription;
          setJobDescription(agentData.jobDescription);
        }
        if (Array.isArray(agentData.missing)) setMissing(agentData.missing);
      }

      setStep("tailoring");
      const tailorRes = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription: jd, resumeText: uploadData.text, company, role }),
      });
      const tailored = await tailorRes.json();
      if (!tailorRes.ok) throw new Error(tailored.error || "Tailoring failed");
      setResult(tailored);

      setStep("generating");
      const pdfRes = await fetch("/api/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tailored),
      });
      const pdfData = await pdfRes.json();
      if (!pdfRes.ok) throw new Error(pdfData.error || "PDF generation failed");
      setDownloadUrl(pdfData.downloadUrl);
      setStep("done");
    } catch (err: any) {
      setError(err.message);
      setStep("idle");
    } finally {
      setLoading(false);
    }
  }

  const currentStep = STEPS[step];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center">
            <span className="text-white text-sm font-bold">JT</span>
          </div>
          <span className="font-semibold text-gray-900 text-lg">JD Tailor</span>
          <span className="ml-auto text-xs text-gray-400">Powered by Gemini</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Tailor your resume to any job
          </h1>
          <p className="text-gray-500">
            Upload your resume PDF, paste a job description, and get a tailored resume with a download-ready PDF in seconds.
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
                <input
                  placeholder="e.g. Google"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <input
                  placeholder="e.g. Senior Engineer"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Resume PDF <span className="text-red-400">*</span>
              </label>
              <label className="flex items-center gap-3 border border-dashed border-gray-300 rounded-lg px-4 py-3 cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors">
                <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm text-gray-500">
                  {resumeFile ? resumeFile.name : "Click to upload resume PDF"}
                </span>
                <input
                  type="file"
                  accept=".pdf"
                  required
                  className="sr-only"
                  onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Job posting URL <span className="text-gray-400">(optional — the agent fetches & scores it)</span>
              </label>
              <input
                placeholder="https://careers.example.com/jobs/senior-engineer"
                value={jdUrl}
                onChange={(e) => setJdUrl(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Job Description {!jdUrl.trim() && <span className="text-red-400">*</span>}
                {jdUrl.trim() && <span className="text-gray-400"> (leave blank to use the URL)</span>}
              </label>
              <textarea
                placeholder="Paste the full job description here..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                rows={10}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
              />
            </div>

            {/* Progress bar */}
            {loading && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{currentStep.label}</span>
                  <span>{currentStep.pct}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-gray-900 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${currentStep.pct}%` }}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Working..." : "Tailor My Resume"}
            </button>
          </form>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-6">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">
            {/* Name + contact */}
            <div className="border-b border-gray-100 pb-4">
              <h2 className="text-xl font-bold text-gray-900">{result.name}</h2>
              <p className="text-xs text-gray-400 mt-1">
                {[result.contact?.email, result.contact?.phone, result.contact?.linkedin, result.contact?.github]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>

            {/* Relevance note */}
            {result.relevanceNotes && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-800">
                <span className="font-medium">Tip: </span>{result.relevanceNotes}
              </div>
            )}

            {/* Agent gap analysis */}
            {missing.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-sm text-amber-800">
                <span className="font-medium">JD keywords not found in your resume: </span>
                {missing.join(", ")}
              </div>
            )}

            {/* Experience */}
            {result.experience?.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Experience</h3>
                <div className="space-y-4">
                  {result.experience.map((exp, i) => (
                    <div key={i}>
                      <div className="flex justify-between items-baseline">
                        <span className="font-semibold text-sm text-gray-900">{exp.role} — {exp.company}</span>
                        <span className="text-xs text-gray-400 shrink-0 ml-2">{exp.duration}</span>
                      </div>
                      <ul className="mt-1.5 space-y-1 pl-4">
                        {exp.bullets?.map((b, j) => (
                          <li key={j} className="text-sm text-gray-700 list-disc">{b}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Projects */}
            {result.projects?.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Projects</h3>
                <div className="space-y-4">
                  {result.projects.map((proj, i) => (
                    <div key={i}>
                      <div className="flex justify-between items-baseline">
                        <span className="font-semibold text-sm text-gray-900">{proj.name}</span>
                        <span className="text-xs text-gray-400 shrink-0 ml-2">{proj.tech}</span>
                      </div>
                      <ul className="mt-1.5 space-y-1 pl-4">
                        {proj.bullets?.map((b, j) => (
                          <li key={j} className="text-sm text-gray-700 list-disc">{b}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Achievements */}
            {result.achievements?.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Achievements</h3>
                <ul className="space-y-1 pl-4">
                  {result.achievements.map((a, i) => (
                    <li key={i} className="text-sm text-gray-700 list-disc">{a}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* Skills */}
            {result.skills?.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Skills</h3>
                <div className="flex flex-wrap gap-1.5">
                  {result.skills.map((s, i) => (
                    <span key={i} className="bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full">{s}</span>
                  ))}
                </div>
              </section>
            )}

            {/* Education */}
            {result.education?.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Education</h3>
                <div className="space-y-2">
                  {result.education.map((ed, i) => (
                    <div key={i} className="flex justify-between items-baseline">
                      <div>
                        <span className="font-semibold text-sm text-gray-900">{ed.school}</span>
                        <span className="text-xs text-gray-500 ml-2">{ed.degree}{ed.grade ? ` · ${ed.grade}` : ""}</span>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0 ml-2">{ed.year}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Download */}
        {downloadUrl && (
          <div className="mt-4">
            <a
              href={downloadUrl}
              download="tailored-resume.pdf"
              className="flex items-center justify-center gap-2 w-full bg-gray-900 text-white py-3 rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Tailored Resume PDF
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
