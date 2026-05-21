"use client";

import { useState, useEffect, useRef } from "react";
import { useClone } from "@/lib/hooks/useClone";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface HandoffReport {
  status: "not_started" | "generating" | "complete" | "failed";
  domain_summary?: string;
  key_decisions?: Array<{ title: string; date: string; rationale: string; outcome: string }>;
  key_contacts?: Array<{ name: string; relationship: string; context: string }>;
  processes_owned?: Array<{ name: string; description: string; steps: string[] }>;
  successor_notes?: string;
  memory_stats?: Record<string, number>;
  generated_at?: string;
}

export default function HandoffPage() {
  const { clone, isLoading } = useClone();
  const [report, setReport] = useState<HandoffReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchReport() {
    if (!clone?.handle) return;
    const res = await fetch(`/api/handoff/report?handle=${clone.handle}`);
    const data = await res.json();
    setReport(data);
    return data;
  }

  useEffect(() => {
    if (!clone) return;
    setLoadingReport(true);
    fetchReport().finally(() => setLoadingReport(false));
  }, [clone]);

  // Poll while generating
  useEffect(() => {
    if (report?.status === "generating") {
      pollRef.current = setInterval(async () => {
        const data = await fetchReport();
        if (data?.status !== "generating") {
          clearInterval(pollRef.current!);
        }
      }, 3000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [report?.status]);

  async function triggerHandoff() {
    if (!clone) return;
    setTriggering(true);
    setShowConfirm(false);
    try {
      await fetch("/api/handoff/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: clone.handle }),
      });
      setReport({ status: "generating" });
    } catch {
      // error handled by polling
    } finally {
      setTriggering(false);
    }
  }

  function downloadJson() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${clone?.handle ?? "handoff"}-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading || loadingReport) return <LoadingSpinner />;
  if (!clone) {
    return (
      <div className="p-8">
        <p className="text-sm text-white/40">
          Create your clone first.{" "}
          <a href="/onboarding" className="text-white/60 underline underline-offset-2">Get started →</a>
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl flex flex-col gap-6">
      <div>
        <p className="text-[11px] uppercase tracking-widest text-white/25 mb-2">Knowledge</p>
        <h1 className="text-2xl font-light text-white/85">Knowledge Handoff</h1>
        <p className="text-sm text-white/35 mt-1 leading-relaxed">
          Capture and preserve everything you know before moving on. Generates a structured
          transfer report from your full knowledge base.
        </p>
      </div>

      {/* Not started */}
      {(!report || report.status === "not_started" || report.status === "failed") && (
        <>
          <div className="glass rounded-2xl p-6">
            <h3 className="text-sm font-medium text-white/60 mb-2">Generate Transfer Report</h3>
            <p className="text-xs text-white/35 leading-relaxed mb-5">
              This will run a final full ingestion sweep (Gmail, Slack, all connected sources),
              then synthesise a structured knowledge transfer document covering your domains,
              key decisions, owned processes, key contacts, and successor notes.
            </p>
            {report?.status === "failed" && (
              <p className="text-xs text-red-400/60 mb-3">
                Previous attempt failed. You can try again.
              </p>
            )}
            {showConfirm ? (
              <div className="glass-md rounded-xl p-4 flex flex-col gap-3">
                <p className="text-xs text-white/55 leading-relaxed">
                  This will mark your clone as <span className="text-white/75">preserved</span>{" "}
                  and block further ingestion. The report usually takes 1–3 minutes. Continue?
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={triggerHandoff}
                    disabled={triggering}
                    className="glass-hi hover:bg-white/[0.14] rounded-xl px-5 py-2 text-sm text-white/80 transition-all disabled:opacity-50"
                  >
                    {triggering ? "Starting…" : "Yes, generate report"}
                  </button>
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="glass hover:glass-md rounded-xl px-4 py-2 text-sm text-white/45 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowConfirm(true)}
                className="glass-hi hover:bg-white/[0.14] rounded-xl px-5 py-2.5 text-sm text-white/80 transition-all"
              >
                Generate Knowledge Transfer Report →
              </button>
            )}
          </div>

          <div className="glass rounded-2xl p-6">
            <h3 className="text-sm font-medium text-white/60 mb-4">What gets captured</h3>
            <div className="flex flex-col gap-2.5">
              {[
                ["Domain expertise", "The core areas and topics you have deep knowledge in"],
                ["Key decisions", "Important choices you made, with rationale and outcomes"],
                ["Key contacts", "People you work with and the context of those relationships"],
                ["Owned processes", "Standard procedures and how-tos you've developed"],
                ["Successor notes", "Direct advice for whoever takes over your responsibilities"],
              ].map(([title, desc]) => (
                <div key={title} className="flex gap-3">
                  <div className="w-1 h-1 rounded-full bg-white/20 mt-2 shrink-0" />
                  <div>
                    <p className="text-xs text-white/60 font-medium">{title}</p>
                    <p className="text-[11px] text-white/30 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Generating */}
      {report?.status === "generating" && (
        <div className="glass rounded-2xl p-8 flex flex-col items-center gap-4 text-center">
          <div className="w-8 h-8 rounded-full border border-white/20 border-t-white/60 animate-spin" />
          <p className="text-sm font-medium text-white/60">Synthesising your knowledge transfer report…</p>
          <p className="text-xs text-white/30 max-w-xs leading-relaxed">
            Running a final ingestion sweep, then generating your report. This usually takes 1–3 minutes.
          </p>
        </div>
      )}

      {/* Complete */}
      {report?.status === "complete" && (
        <CompleteReport report={report} onDownload={downloadJson} handle={clone.handle} />
      )}
    </div>
  );
}

function CompleteReport({
  report,
  onDownload,
  handle,
}: {
  report: HandoffReport;
  onDownload: () => void;
  handle: string;
}) {
  const [openProcess, setOpenProcess] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="glass rounded-2xl px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400/70" />
          <p className="text-sm text-white/60 font-medium">Report complete</p>
          {report.generated_at && (
            <p className="text-xs text-white/25">
              · {new Date(report.generated_at).toLocaleDateString()}
            </p>
          )}
        </div>
        <button
          onClick={onDownload}
          className="glass hover:glass-md rounded-xl px-4 py-1.5 text-xs text-white/50 hover:text-white/70 transition-all"
        >
          Download JSON →
        </button>
      </div>

      {/* Memory stats */}
      {report.memory_stats && Object.keys(report.memory_stats).length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(report.memory_stats).map(([table, count]) => (
            <div key={table} className="glass rounded-xl p-3 text-center">
              <p className="text-lg font-light text-white/75">{count}</p>
              <p className="text-[10px] text-white/30 mt-0.5">{table.replace("_memory", "")}</p>
            </div>
          ))}
        </div>
      )}

      {/* Domain summary */}
      {report.domain_summary && (
        <div className="glass rounded-2xl p-5">
          <p className="text-[11px] uppercase tracking-widest text-white/25 mb-3">Domain Expertise</p>
          <p className="text-sm text-white/60 leading-relaxed">{report.domain_summary}</p>
        </div>
      )}

      {/* Key decisions */}
      {(report.key_decisions ?? []).length > 0 && (
        <div className="glass rounded-2xl p-5">
          <p className="text-[11px] uppercase tracking-widest text-white/25 mb-4">Key Decisions</p>
          <div className="flex flex-col gap-3">
            {report.key_decisions!.map((d, i) => (
              <div key={i} className="glass-md rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <p className="text-sm font-medium text-white/70">{d.title}</p>
                  {d.date && <p className="text-[10px] text-white/25 shrink-0">{d.date}</p>}
                </div>
                {d.rationale && (
                  <p className="text-xs text-white/45 leading-relaxed mb-1">{d.rationale}</p>
                )}
                {d.outcome && (
                  <p className="text-xs text-white/30 leading-relaxed italic">{d.outcome}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key contacts */}
      {(report.key_contacts ?? []).length > 0 && (
        <div className="glass rounded-2xl p-5">
          <p className="text-[11px] uppercase tracking-widest text-white/25 mb-4">Key Contacts</p>
          <div className="grid grid-cols-2 gap-3">
            {report.key_contacts!.map((c, i) => (
              <div key={i} className="glass-md rounded-xl p-3">
                <p className="text-xs font-medium text-white/70 mb-0.5">{c.name}</p>
                {c.relationship && (
                  <p className="text-[10px] text-white/35 mb-1">{c.relationship}</p>
                )}
                {c.context && (
                  <p className="text-[11px] text-white/30 leading-relaxed">{c.context}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Processes owned */}
      {(report.processes_owned ?? []).length > 0 && (
        <div className="glass rounded-2xl p-5">
          <p className="text-[11px] uppercase tracking-widest text-white/25 mb-4">Owned Processes</p>
          <div className="flex flex-col gap-2">
            {report.processes_owned!.map((p, i) => (
              <div key={i} className="glass-md rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenProcess(openProcess === i ? null : i)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left"
                >
                  <p className="text-xs font-medium text-white/65">{p.name}</p>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    className={`text-white/30 transition-transform ${openProcess === i ? "rotate-180" : ""}`}
                  >
                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </button>
                {openProcess === i && (
                  <div className="px-4 pb-4">
                    {p.description && (
                      <p className="text-xs text-white/40 leading-relaxed mb-3">{p.description}</p>
                    )}
                    {(p.steps ?? []).length > 0 && (
                      <ol className="flex flex-col gap-1.5">
                        {p.steps.map((step, si) => (
                          <li key={si} className="flex gap-2 text-[11px] text-white/35">
                            <span className="text-white/20 shrink-0">{si + 1}.</span>
                            {step}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Successor notes */}
      {report.successor_notes && (
        <div className="glass rounded-2xl p-5 border border-white/[0.08]">
          <p className="text-[11px] uppercase tracking-widest text-white/25 mb-3">Successor Notes</p>
          <p className="text-sm text-white/55 leading-relaxed">{report.successor_notes}</p>
        </div>
      )}
    </div>
  );
}
