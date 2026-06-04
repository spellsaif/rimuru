import Link from "next/link";

const pillars = [
  {
    title: "Sovereignty",
    text: "Your machine is the center of the universe. All memory, secrets, and tools are local-first and physically isolated.",
  },
  {
    title: "Safety",
    text: "Hardened path-resolution ensures the AI is physically forbidden from accessing its own internal credentials.",
  },
  {
    title: "Auditability",
    text: "Every thought and tool execution is recorded in an immutable event stream for absolute transparency.",
  },
];

export default function HomePage() {
  return (
    <main className="slime-page">
      <div className="zen-grid" aria-hidden="true" />

      <nav className="landing-nav">
        <Link className="brand-title" href="/">
          <span className="brand-mark">Ri</span>
          <span>Rimuru</span>
        </Link>
        <div className="flex gap-6">
          <Link href="/docs">Manifesto</Link>
          <Link href="/docs/getting-started">Awaken</Link>
        </div>
      </nav>

      <section className="hero-shell">
        <div className="hero-copy">
          <h1>The Sovereign AI Runtime</h1>
          <p>
            A high-performance, local-first orchestration kernel designed for absolute privacy, auditable reasoning, and
            policy-gated tool execution.
          </p>
          <div className="flex gap-4 justify-center">
            <Link className="button primary" href="/docs/getting-started">
              Awaken the Runtime
            </Link>
            <Link className="button ghost" href="/docs">
              Read the Manifesto
            </Link>
          </div>
        </div>

        <div className="terminal-card">
          <div className="terminal-top">
            <span />
            <span />
            <span />
          </div>
          <pre>
            <code>{`$ rimuru setup --wizard
$ rimuru gate start --port 19710

[gate] Rimuru Sovereign Gateway listening at http://127.0.0.1:19710
[gate] Circle whatsapp is READY!
[gate] Identity: Sovereign Mode Enabled`}</code>
          </pre>
        </div>
      </section>

      <section className="feature-grid">
        {pillars.map((p) => (
          <article className="feature-card" key={p.title}>
            <h3>{p.title}</h3>
            <p>{p.text}</p>
          </article>
        ))}
      </section>

      <section className="hero-shell text-center" style={{ marginTop: "0", paddingBottom: "8rem" }}>
        <p style={{ color: "var(--zen-muted)", fontSize: "0.9rem", maxWidth: "500px", margin: "0 auto" }}>
          "The Sovereign man owns his tools. The Sovereign man owns his data. The Sovereign man owns his future."
        </p>
      </section>
    </main>
  );
}
