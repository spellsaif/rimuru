import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi, afterEach } from "vitest";
import { fileTreeRune, webSearchRune, webFetchUrlRune } from "../src/index.js";

describe("Workspace fileTree & Web Runes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("workspace.fileTree visualizes files and directories recursively", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-tree-test-"));
    try {
      await mkdir(join(root, "src", "nested"), { recursive: true });
      await mkdir(join(root, "node_modules"), { recursive: true }); // Should be ignored

      await writeFile(join(root, "package.json"), "{}", "utf8");
      await writeFile(join(root, "src", "index.ts"), "console.log(1);", "utf8");
      await writeFile(join(root, "src", "nested", "helper.ts"), "export const a = 1;", "utf8");
      await writeFile(join(root, "node_modules", "some-dep.js"), "dep", "utf8"); // Should be ignored

      const result = await fileTreeRune.invoke({ maxDepth: 3 }, { workspace: root, sessionId: "s" });

      expect(result.tree).toContain("package.json");
      expect(result.tree).toContain("src/");
      expect(result.tree).toContain("index.ts");
      expect(result.tree).toContain("nested/");
      expect(result.tree).toContain("helper.ts");
      expect(result.tree).not.toContain("node_modules");
      expect(result.tree).not.toContain("some-dep.js");

      // Verify maxDepth limits traversal
      const resultDepth1 = await fileTreeRune.invoke({ maxDepth: 1 }, { workspace: root, sessionId: "s" });
      expect(resultDepth1.tree).toContain("src/");
      expect(resultDepth1.tree).not.toContain("index.ts"); // nesting should be cut off
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("web.search parses DuckDuckGo HTML organic results", async () => {
    const mockHtml = `
      <html>
        <body>
          <div class="result__body">
            <a class="result__url" href="https://example.com/one">Page One Title</a>
            <a class="result__snippet" href="https://example.com/one">Snippet for page one describing the content.</a>
          </div>
          <div class="result__body">
            <a class="result__url" href="/l/?kh=-1&uddg=https%3A%2F%2Fexample.com%2Ftwo">Page Two Title</a>
            <a class="result__snippet" href="/l/?kh=-1&uddg=https%3A%2F%2Fexample.com%2Ftwo">Snippet for page two.</a>
          </div>
        </body>
      </html>
    `;

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(url).toContain("duckduckgo.com");
      return {
        ok: true,
        text: async () => mockHtml
      };
    }));

    const result = await webSearchRune.invoke({ query: "vitest testing" }, { workspace: "/tmp", sessionId: "s" });

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({
      title: "Page One Title",
      snippet: "Snippet for page one describing the content.",
      url: "https://example.com/one"
    });
    expect(result.results[1]).toEqual({
      title: "Page Two Title",
      snippet: "Snippet for page two.",
      url: "https://example.com/two"
    });
  });

  it("web.fetchUrl downloads HTML page and cleans to Markdown format", async () => {
    const mockHtml = `
      <html>
        <head>
          <title>My Sample Webpage</title>
          <style>body { color: red; }</style>
          <script>console.log("ignore");</script>
        </head>
        <body>
          <h1>Welcome to Sample</h1>
          <p>This is a paragraph with <a href="https://target.com">a useful link</a>.</p>
          <br/>
          <h2>Subsection</h2>
          <p>Another paragraph here.</p>
        </body>
      </html>
    `;

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(url).toBe("https://sample.com/page");
      return {
        ok: true,
        text: async () => mockHtml
      };
    }));

    const result = await webFetchUrlRune.invoke({ url: "https://sample.com/page" }, { workspace: "/tmp", sessionId: "s" });

    expect(result.title).toBe("My Sample Webpage");
    expect(result.content).toContain("# Welcome to Sample");
    expect(result.content).toContain("This is a paragraph with [a useful link](https://target.com).");
    expect(result.content).toContain("## Subsection");
    expect(result.content).toContain("Another paragraph here.");
    expect(result.content).not.toContain("color: red");
    expect(result.content).not.toContain("console.log");
  });
});
