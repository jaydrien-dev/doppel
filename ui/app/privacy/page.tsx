import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Doppel",
  description: "Doppel Privacy Policy. Learn how we collect, use, and protect your data.",
};

const SECTIONS = [
  {
    title: "Data We Collect",
    body: [
      "We collect only what is needed to run Doppel and power your AI clone.",
    ],
    list: [
      "Account information. When you sign up via Clerk, we receive your name, email address, and profile details from your identity provider.",
      "Email data. If you connect Gmail via OAuth, we import your sent emails. We request only read access to sent mail. You can disconnect Gmail at any time from Settings → Integrations.",
      "Slack messages. If you connect Slack, we import messages you have sent in channels and direct messages. We request only the scopes necessary to read your own messages.",
      "Uploaded documents. Any files you upload directly — PDFs, text files, notes — are stored and indexed for your clone.",
      "Seed Q&A answers. Responses you provide during onboarding or manual Q&A sessions are stored as high-priority memories.",
      "Usage data. When you or someone else queries your clone, we store the query and the generated response. This lets you review your clone's activity and helps us detect abuse.",
    ],
    post: [
      "Doppel does not collect payment card details directly — billing is handled by Stripe (see Third-Party Services below).",
    ],
  },
  {
    title: "How We Use Your Data",
    body: [
      "Your data is used to power one thing: your AI clone's responses.",
      "Specifically, we use your data to generate vector embeddings (numerical representations of your content that allow semantic search), retrieve relevant context when your clone receives a query, and generate grounded responses via a language model.",
      "We do not sell your data to any third party. We do not use your data to train AI models that are shared with or benefit other users. Your data is isolated — it belongs to your clone and is never used to improve another user's experience.",
      "We may use anonymized, aggregated statistics (such as total queries per day across all users) for internal analytics and product improvement. This never includes your personal content.",
    ],
  },
  {
    title: "Data Retention",
    body: [
      "Memory data (your ingested emails, documents, messages, and Q&A answers) is retained for 2 years by default from the date of ingestion. You can adjust this window in Settings → Data.",
      "Usage traces (query and response logs) are retained for 1 year by default. You can configure retention in Settings → Data.",
      "When you delete your account, all associated data — memories, usage traces, clone configuration, and account information — is permanently deleted within 30 days. This deletion is irreversible.",
    ],
  },
  {
    title: "Your Rights (GDPR)",
    body: [
      "If you are located in the European Economic Area, UK, or Switzerland, you have the following rights under the General Data Protection Regulation:",
    ],
    list: [
      "Right to access. You can export a full copy of your data from Settings → Export. This includes all memories, usage traces, and clone configuration in JSON format.",
      "Right to deletion. You can delete your account and all associated data from Settings → Delete my data. You can also delete individual memories from Brain Inspector.",
      "Right to correction. You can edit or delete individual memories directly in Brain Inspector. If you need to correct account information, contact us at privacy@doppel.ai.",
      "Right to portability. Your export (Settings → Export) is provided in structured, machine-readable JSON format, which you can use to migrate your data.",
      "Right to object. You can opt out of usage trace logging in Settings → Privacy. Note that disabling this will limit your ability to review your clone's activity.",
    ],
    post: [
      "To exercise any of these rights or if you have questions about how we process your data, contact us at privacy@doppel.ai. We will respond within 30 days.",
    ],
  },
  {
    title: "Third-Party Services",
    body: [
      "Doppel uses a small number of trusted third-party providers to deliver the service:",
    ],
    list: [
      "OpenAI. We send your text to OpenAI's API to generate vector embeddings. These are numerical representations — not your raw text. OpenAI does not use API inputs to train their models per their API data usage policy.",
      "Anthropic. We send relevant context (retrieved memories + your query) to Anthropic's Claude API to generate clone responses. Anthropic does not use API inputs to train their models per our enterprise agreement.",
      "Clerk. Authentication and account management is handled by Clerk. They store your account credentials and session data. See Clerk's privacy policy at clerk.com/privacy.",
      "Stripe. Billing and subscription management is handled by Stripe. Doppel never sees or stores your payment card details. See Stripe's privacy policy at stripe.com/privacy.",
    ],
    post: [
      "None of these providers use your personal data to train their own models based on our agreements. We vet all providers before integration and will update this list if we add new services.",
    ],
  },
  {
    title: "Security",
    body: [
      "We take security seriously. Here is how we protect your data:",
    ],
    list: [
      "Data in transit is encrypted using TLS 1.3. All connections to Doppel are encrypted.",
      "Data at rest is encrypted using AES-256. This applies to your stored memories, documents, usage logs, OAuth tokens, and account information.",
      "Row-level isolation. Your clone's data is isolated at the database level using row-level security policies. Other users cannot access your data.",
      "API key overrides. If you provide your own OpenAI or Anthropic API keys in Settings, they are stored encrypted and never exposed in logs or responses.",
    ],
    post: [
      "We perform regular security reviews and will notify affected users promptly in the event of a breach that affects their data.",
    ],
  },
  {
    title: "Contact",
    body: [
      "For privacy-related questions, requests, or concerns, contact us at privacy@doppel.ai for general privacy inquiries and rights requests, or dpo@doppel.ai for GDPR-specific matters and formal data processing inquiries.",
      "We aim to respond to all privacy requests within 5 business days and fulfill them within 30 days.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="doppel-marketing" style={{ fontFamily: "var(--font-sans)" }}>
      {/* Nav */}
      <header className="nav nav--scrolled">
        <div className="nav__inner">
          <Link href="/" className="nav__brand">
            <span className="nav__brand__mark" />
            doppel
          </Link>
          <nav className="nav__links">
            <Link className="nav__link" href="/#pricing">Pricing</Link>
            <Link className="nav__link" href="/contact">Contact</Link>
          </nav>
          <div className="nav__cta-group">
            <Link href="/sign-in" className="btn btn--ghost">Sign in</Link>
            <Link href="/sign-up" className="btn btn--primary">Start free</Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="legal">
        <h1 className="legal__h1">Privacy Policy</h1>
        <p className="legal__date">Last updated May 1, 2026</p>

        <p>
          Your privacy is the foundation of Doppel. This policy explains what data we collect, why we
          collect it, how it is used, and the rights you have over it. We&apos;ve tried to write this
          plainly — no legalese where plain language will do. If something is unclear, email us at{" "}
          <a href="mailto:privacy@doppel.ai">privacy@doppel.ai</a>.
        </p>

        {SECTIONS.map((section, i) => (
          <div key={i}>
            <h2>{i + 1}. {section.title}</h2>
            {section.body.map((para, j) => (
              <p key={j}>{para}</p>
            ))}
            {"list" in section && section.list && (
              <ul>
                {section.list.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            )}
            {"post" in section && section.post?.map((para, j) => (
              <p key={j}>{para}</p>
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer className="foot">
        <div className="foot__inner">
          <div className="foot__brand">doppel</div>
          <span className="foot__legal">&copy; 2026 Doppel AI, Inc.</span>
          <div className="foot__links">
            <Link href="/contact">Contact</Link>
            <a href="/terms">Terms</a>
            <a href="/privacy">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
