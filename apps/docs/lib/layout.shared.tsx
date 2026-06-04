import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="brand-title">
          <span className="brand-mark">Ri</span>
          <span>Rimuru</span>
        </span>
      ),
    },
    links: [
      { text: "Docs", url: "/docs", active: "nested-url" },
      { text: "Production", url: "/docs/production" },
      { text: "GitHub", url: "https://github.com/rimuru-ai/rimuru", external: true },
    ],
  };
}
