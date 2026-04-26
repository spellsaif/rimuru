import Link from "next/link";

const features = [
  ["Gate", "Local HTTP/SSE control plane for chat, agents, sessions, traces, Runes, Circles, Vault, Rituals, and Canvas."],
  ["Runes", "Typed tools with schemas and explicit read/write/execute/network risk classes."],
  ["Sage", "Replayable traces and Flow events so the assistant never becomes hidden magic."],
  ["Circles", "Channel ingress for local webhooks, Telegram, Slack, Discord-compatible bridges, and future adapters."],
  ["Vault", "Encrypted local secret storage for channel and provider credentials."],
  ["Rituals", "Scheduled prompts for recurring local automations while Gate is running."]
];

export default function HomePage() {
  return (
    <main className="slime-page">
      <div className="slime-field" aria-hidden="true">
        <span className="blob blob-a" />
        <span className="blob blob-b" />
        <span className="blob blob-c" />
      </div>

      <nav className="landing-nav">
        <Link className="brand-title" href="/">
          <span className="brand-mark">Ri</span>
          <span>Rimuru</span>
        </Link>
        <div>
          <Link href="/docs">Docs</Link>
          <Link href="/docs/getting-started">Install</Link>
          <Link href="/docs/production">Production</Link>
        </div>
      </nav>

      <section className="hero-shell">
        <div className="hero-copy">
          <p className="eyebrow">Sky-blue slime. Steel-grade runtime.</p>
          <h1>A local-first AI assistant you can understand, audit, and extend.</h1>
          <p>
            Rimuru is a safe assistant platform with a clean TypeScript runtime, policy-guarded tools, persistent memory,
            channel integrations, traces, plugins, scheduler, dashboard, and a local Gate API.
          </p>
          <div className="hero-actions">
            <Link className="button primary" href="/docs/getting-started">Start in 60 seconds</Link>
            <Link className="button ghost" href="/docs/concepts">Learn the model</Link>
          </div>
          <div className="trust-row">
            <span>Read-only by default</span>
            <span>Auditable traces</span>
            <span>Local-first</span>
          </div>
        </div>

        <div className="terminal-card">
          <div className="terminal-top"><span /><span /><span /></div>
          <pre><code>{`$ rimuru setup --wizard
$ rimuru gate start --port 19710

Rimuru Gate listening at http://127.0.0.1:19710

$ rimuru doctor --json
{
  "provider": "mock",
  "risks": "read",
  "diagnostics": []
}`}</code></pre>
        </div>
      </section>

      <section className="landing-section split">
        <div>
          <p className="eyebrow">Why Rimuru Exists</p>
          <h2>Powerful assistants should not be opaque.</h2>
        </div>
        <p>
          Rimuru follows the path of personal AI gateway tools, but its opinion is stricter: architecture should be small, actions
          should be permissioned, traces should be readable, and every extension should declare what power it needs.
        </p>
      </section>

      <section className="feature-grid">
        {features.map(([title, text]) => (
          <article className="feature-card" key={title}>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </section>

      <section className="landing-section final-cta">
        <p className="eyebrow">Ready</p>
        <h2>Start small. Keep control. Grow into a full assistant platform.</h2>
        <pre><code>{`npm install -g rimuru
rimuru setup --wizard
rimuru gate start`}</code></pre>
      </section>
    </main>
  );
}
