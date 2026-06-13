import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ─── Mermaid diagram ──────────────────────────────────────────────────────────

function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            background: "transparent",
            primaryColor: "rgba(255,255,255,0.10)",
            primaryTextColor: "rgba(255,255,255,0.80)",
            primaryBorderColor: "rgba(255,255,255,0.15)",
            lineColor: "rgba(255,255,255,0.30)",
            secondaryColor: "rgba(255,255,255,0.06)",
            tertiaryColor: "rgba(255,255,255,0.04)",
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
            fontSize: "13px",
          },
        });
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg: rendered } = await mermaid.render(id, code);
        if (!cancelled) setSvg(rendered);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Diagram error");
      }
    }
    render();
    return () => { cancelled = true; };
  }, [code]);

  if (error) return (
    <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", fontSize: 12, color: "rgba(248,113,113,0.70)" }}>
      Diagram error: {error}
    </div>
  );
  if (!svg) return (
    <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
      Rendering diagram…
    </div>
  );
  return (
    <div
      style={{ padding: 16, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", overflowX: "auto", maxWidth: "100%" }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// ─── Code block ───────────────────────────────────────────────────────────────

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  if (language === "mermaid") return <MermaidDiagram code={code} />;

  return (
    <div style={{ margin: "6px 0" }}>
      {language && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 12px", background: "rgba(255,255,255,0.06)", borderRadius: "10px 10px 0 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.35)" }}>{language}</span>
          <button
            onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            style={{ fontSize: 10, color: copied ? "rgba(52,211,153,0.70)" : "rgba(255,255,255,0.30)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
          >{copied ? "Copied" : "Copy"}</button>
        </div>
      )}
      <pre style={{
        margin: 0, padding: "12px 14px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: language ? "0 0 10px 10px" : 10,
        borderTop: language ? "none" : undefined,
        overflowX: "auto", fontSize: 13, lineHeight: 1.6,
        color: "rgba(255,255,255,0.82)",
        fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code',monospace",
      }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ─── Prose styles ─────────────────────────────────────────────────────────────

const PROSE_CSS = `
.md-prose { font-size: 14px; line-height: 1.65; color: rgba(255,255,255,0.88); word-break: break-word; }
.md-prose p { margin: 0 0 10px; }
.md-prose p:last-child { margin-bottom: 0; }
.md-prose strong { font-weight: 600; color: rgba(255,255,255,0.95); }
.md-prose em { font-style: italic; color: rgba(255,255,255,0.75); }
.md-prose h1 { font-size: 18px; font-weight: 500; color: rgba(255,255,255,0.95); margin: 14px 0 8px; }
.md-prose h2 { font-size: 16px; font-weight: 500; color: rgba(255,255,255,0.90); margin: 12px 0 6px; }
.md-prose h3 { font-size: 14px; font-weight: 500; color: rgba(255,255,255,0.85); margin: 10px 0 4px; }
.md-prose ul, .md-prose ol { margin: 4px 0 10px; padding-left: 20px; }
.md-prose li { margin: 3px 0; color: rgba(255,255,255,0.82); }
.md-prose li::marker { color: rgba(255,255,255,0.30); }
.md-prose blockquote { margin: 8px 0; padding: 8px 14px; border-left: 2px solid rgba(255,255,255,0.18); color: rgba(255,255,255,0.55); font-style: italic; }
.md-prose code:not(pre code) { font-family: 'JetBrains Mono','Fira Code',monospace; font-size: 12.5px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.10); border-radius: 4px; padding: 1px 5px; color: rgba(255,255,255,0.85); }
.md-prose hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 12px 0; }
.md-prose table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 13px; }
.md-prose th { padding: 7px 12px; text-align: left; font-weight: 500; color: rgba(255,255,255,0.70); border-bottom: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); }
.md-prose td { padding: 6px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: rgba(255,255,255,0.75); }
.md-prose tr:last-child td { border-bottom: none; }
.md-prose a { color: rgba(147,197,253,0.80); text-decoration: none; }
.md-prose a:hover { text-decoration: underline; }
`;

// ─── Export ───────────────────────────────────────────────────────────────────

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="md-prose">
      <style>{PROSE_CSS}</style>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children }) {
            const match = /language-(\w+)/.exec(className || "");
            const code = String(children).replace(/\n$/, "");
            if (match || code.includes("\n")) {
              return <CodeBlock language={match?.[1] ?? ""} code={code} />;
            }
            return <code className={className}>{children}</code>;
          },
          pre({ children }) {
            return <>{children}</>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
