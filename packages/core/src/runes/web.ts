import type { Rune } from "../core/types.js";
import { isSafeExternalHttpUrl, readResponseTextWithLimit } from "../security/url.js";

// Helper to strip HTML tags and decode basic HTML entities
function stripHtmlTags(str: string): string {
  return str
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// Converts standard HTML layout to a readable, clean Markdown text format
function htmlToMarkdown(html: string): string {
  let text = html;

  // Remove script, style, head, and comment tags
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<head[\s\S]*?<\/head>/gi, "");
  text = text.replace(/<!--[\s\S]*?-->/g, "");

  // Format headers
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n");
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n");
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n");
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n#### $1\n");

  // Format paragraphs and line breaks
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // Format simple links
  text = text.replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");

  // Strip all other HTML tags
  text = stripHtmlTags(text);

  // Split and collapse whitespace
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

export const webSearchRune: Rune<
  { readonly query: string },
  { readonly results: readonly { title: string; snippet: string; url: string }[] }
> = {
  name: "web.search",
  description: "Searches the web via DuckDuckGo and returns organic titles, snippets, and URLs.",
  risk: "network",
  inputSchema: {
    type: "object",
    required: ["query"],
    properties: {
      query: { type: "string" },
    },
  },
  async invoke(input) {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo search request failed: ${response.statusText}`);
    }

    const html = await response.text();
    const results: { title: string; snippet: string; url: string }[] = [];
    const resultRegex = /<div[^>]+class="[^"]*result__body[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
    let match = resultRegex.exec(html);

    while (match !== null) {
      const body = match[1] ?? "";
      const urlAnchorMatch = body.match(/<a[^>]+class="[^"]*result__url[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
      const snippetAnchorMatch = body.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);

      if (urlAnchorMatch) {
        const fullAnchor = urlAnchorMatch[0];
        const hrefMatch = fullAnchor.match(/href="([^"]+)"/i);
        const rawUrl = hrefMatch?.[1];
        if (rawUrl) {
          let targetUrl = rawUrl;
          const uddgMatch = rawUrl.match(/[?&]uddg=([^&]+)/);
          const encodedTarget = uddgMatch?.[1];
          if (encodedTarget) {
            targetUrl = decodeURIComponent(encodedTarget);
          }

          const title = stripHtmlTags(urlAnchorMatch[1] ?? "").trim();
          const snippet = snippetAnchorMatch ? stripHtmlTags(snippetAnchorMatch[1] ?? "").trim() : "";

          if (title && targetUrl) {
            results.push({ title, snippet, url: targetUrl });
          }
        }
      }
      match = resultRegex.exec(html);
    }

    return { results };
  },
};

export const webFetchUrlRune: Rune<{ readonly url: string }, { readonly title: string; readonly content: string }> = {
  name: "web.fetchUrl",
  description: "Fetches the text content of a web page and converts it to readable Markdown.",
  risk: "network",
  inputSchema: {
    type: "object",
    required: ["url"],
    properties: {
      url: { type: "string" },
    },
  },
  async invoke(input) {
    const url = isSafeExternalHttpUrl(input.url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url.href, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch web page: ${response.statusText}`);
      }

      const contentType = response.headers?.get?.("content-type") ?? "";
      if (contentType && !/text\/|application\/(xhtml\+xml|xml|json)/i.test(contentType)) {
        throw new Error(`Failed to fetch web page: unsupported content type ${contentType}`);
      }

      const html = await readResponseTextWithLimit(response, 1_000_000);
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? stripHtmlTags(titleMatch[1] ?? "").trim() : "Untitled Page";
      const content = htmlToMarkdown(html);

      return { title, content };
    } finally {
      clearTimeout(timeout);
    }
  },
};

export const webRunes = [webSearchRune, webFetchUrlRune] as const;
