"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  MessageSquare,
  Activity,
  Settings,
  FileCode,
  Copy,
  Palette,
  Command,
  Zap,
  Plus,
  MoreHorizontal,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type ThemeMode = "dark" | "light";

interface ThemeConfig {
  id: string;
  name: string;
  mode: ThemeMode;
  accent: string;
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
}

const ALL_THEMES: ThemeConfig[] = [
  {
    id: "zen-dark",
    name: "Zen Dark",
    mode: "dark",
    accent: "#ffffff",
    bg: "#000000",
    surface: "#0a0a0a",
    border: "#1a1a1a",
    text: "#ffffff",
    muted: "#666666",
  },
  {
    id: "zen-light",
    name: "Zen Light",
    mode: "light",
    accent: "#000000",
    bg: "#ffffff",
    surface: "#fafafa",
    border: "#e5e5e5",
    text: "#000000",
    muted: "#888888",
  },
  {
    id: "slate-pro",
    name: "Slate Pro",
    mode: "dark",
    accent: "#38bdf8",
    bg: "#020617",
    surface: "#0f172a",
    border: "#1e293b",
    text: "#f8fafc",
    muted: "#64748b",
  },
];

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  at: Date;
}

export default function Dashboard() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [theme, setTheme] = useState<ThemeConfig>(ALL_THEMES[0]);
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [gateUrl, setGateUrl] = useState("http://localhost:19710");

  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<any | null>(null);
  const [showCanvas, setShowCanvas] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const origin = window.location.origin;
      if (window.location.port === "19711") {
        setGateUrl(origin.replace(":19711", ":19710"));
      } else if (window.location.port === "3000") {
        setGateUrl("http://localhost:19710");
      } else {
        setGateUrl(origin);
      }
    }
  }, []);

  const fetchArtifacts = async () => {
    try {
      const res = await fetch(`${gateUrl}/canvas`);
      if (res.ok) {
        const data = await res.json();
        const list = data.artifacts || [];
        setArtifacts(list);
        if (list.length > 0 && !selectedArtifact) {
          fetchArtifactContent(list[0].title);
          setShowCanvas(true);
        }
      }
    } catch (e) {}
  };

  const fetchArtifactContent = async (title: string) => {
    try {
      const res = await fetch(`${gateUrl}/canvas/${encodeURIComponent(title)}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedArtifact(data);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchArtifacts();
    const timer = setInterval(fetchArtifacts, 3000);
    return () => clearInterval(timer);
  }, [gateUrl, selectedArtifact]);

  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      const scroll = () => {
        el.scrollTop = el.scrollHeight;
      };
      requestAnimationFrame(scroll);
    }
  }, [messages, isThinking]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isThinking) return;

    const userMsg: Message = { id: Math.random().toString(36), role: "user", content: input, at: new Date() };
    const assistantId = Math.random().toString(36);
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "", at: new Date() };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsThinking(true);

    try {
      const response = await fetch(`${gateUrl}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: input, sessionId: "web-session" }),
      });

      if (!response.body) throw new Error("No body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "text") {
                fullContent += data.text;
                setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: fullContent } : m)));
              } else if (data.type === "done") {
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, content: data.response.content } : m)),
                );
                fetchArtifacts();
              }
            } catch (e) {}
          }
        }
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, role: "system", content: "Gate Offline" } : m)),
      );
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div
      className="flex h-screen w-screen transition-all duration-500"
      style={{ backgroundColor: theme.bg, color: theme.text }}
    >
      {/* Top Navigation Bar */}
      <header
        className="absolute top-0 left-0 right-0 h-16 border-b z-50 flex items-center justify-between px-8"
        style={{ borderColor: theme.border, backgroundColor: theme.bg }}
      >
        <div className="flex items-center gap-4">
          <Zap className="w-5 h-5" style={{ color: theme.accent }} />
          <span className="text-xs font-bold tracking-widest uppercase" style={{ color: theme.text }}>
            Rimuru Sovereign
          </span>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-[10px] font-bold">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="opacity-60">PORT 19710</span>
          </div>

          <div className="relative">
            <button onClick={() => setShowThemeMenu(!showThemeMenu)} className="hover:opacity-60 transition-opacity">
              <Palette className="w-4 h-4" />
            </button>
            <AnimatePresence>
              {showThemeMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute right-0 mt-4 w-48 border rounded-lg shadow-xl overflow-hidden z-[100]"
                  style={{ backgroundColor: theme.surface, borderColor: theme.border }}
                >
                  {ALL_THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setTheme(t);
                        setShowThemeMenu(false);
                      }}
                      className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors text-xs border-b last:border-0"
                      style={{ borderColor: theme.border }}
                    >
                      <span>{t.name}</span>
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.accent }} />
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button className="transition-colors" style={{ color: `${theme.text}99` }}>
            <Settings className="w-4 h-4 hover:opacity-100" style={{ color: theme.text }} />
          </button>
        </div>
      </header>

      {/* Main Experience */}
      <main className="flex-1 flex pt-16 overflow-hidden">
        {/* Left Side: Chat */}
        <div
          className={cn(
            "flex-1 flex flex-col h-full border-r transition-all duration-300",
            showCanvas ? "w-1/2" : "w-full",
          )}
          style={{ borderColor: theme.border }}
        >
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-12 space-y-12 no-scrollbar">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center opacity-10">
                <Zap className="w-16 h-16 mb-6" />
                <h1 className="text-sm font-bold tracking-[0.3em] uppercase">Ready for Input</h1>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div
                key={msg.id}
                className={cn(
                  "w-full px-12 py-10 transition-all duration-500 border-l-4",
                  msg.role === "user" ? "bg-white/[0.02] border-white/20" : "bg-transparent border-transparent",
                )}
                style={{ borderLeftColor: msg.role === "assistant" ? theme.accent : undefined }}
              >
                <div className="max-w-[1400px] mx-auto flex gap-12">
                  <div className="shrink-0 w-12 flex flex-col items-center">
                    <div
                      className="w-8 h-8 rounded flex items-center justify-center border"
                      style={{ borderColor: theme.border }}
                    >
                      {msg.role === "user" ? (
                        <Command className="w-4 h-4 opacity-40" />
                      ) : (
                        <Zap className="w-4 h-4" style={{ color: theme.accent }} />
                      )}
                    </div>
                  </div>
                  <div className="flex-1 text-lg leading-relaxed font-normal" style={{ color: theme.text }}>
                    <MarkdownContent content={msg.content} theme={theme} />
                    {isThinking && idx === messages.length - 1 && msg.role === "assistant" && (
                      <span
                        className="inline-block w-1.5 h-4 ml-1 animate-pulse"
                        style={{ backgroundColor: theme.text }}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t px-12 py-8" style={{ borderColor: theme.border }}>
            <div className="max-w-[1400px] mx-auto relative">
              <form onSubmit={handleSend} className="flex items-center gap-4">
                <Plus className="w-5 h-5 cursor-pointer transition-colors" style={{ color: `${theme.text}66` }} />
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Enter command..."
                  className="flex-1 bg-transparent border-none outline-none py-2 text-lg font-normal"
                  style={{ color: theme.text }}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isThinking}
                  className="transition-colors disabled:opacity-10"
                  style={{ color: `${theme.text}66` }}
                >
                  <Send className="w-5 h-5 hover:opacity-100" style={{ color: theme.text }} />
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Right Side: Interactive Canvas preview panel */}
        {showCanvas && (
          <div className="w-1/2 h-full flex flex-col" style={{ backgroundColor: theme.surface }}>
            <div
              className="h-14 border-b flex items-center justify-between px-6 shrink-0"
              style={{ borderColor: theme.border, backgroundColor: theme.bg }}
            >
              <div className="flex items-center gap-3">
                <FileCode className="w-4 h-4" style={{ color: theme.accent }} />
                <span className="text-xs font-bold uppercase tracking-wider">Visual Canvas</span>
              </div>
              <select
                value={selectedArtifact?.title || ""}
                onChange={(e) => fetchArtifactContent(e.target.value)}
                className="bg-transparent border rounded px-3 py-1 text-xs outline-none focus:ring-1"
                style={{ borderColor: theme.border, color: theme.text }}
              >
                {artifacts.map((a) => (
                  <option key={a.title} value={a.title} className="bg-black text-white">
                    {a.title} ({a.kind})
                  </option>
                ))}
              </select>
            </div>

            {selectedArtifact ? (
              <div className="flex-1 flex flex-col overflow-hidden relative">
                {selectedArtifact.kind === "html" ? (
                  <iframe
                    title={selectedArtifact.title}
                    srcDoc={selectedArtifact.content}
                    className="w-full flex-1 border-none bg-white"
                    sandbox="allow-scripts"
                  />
                ) : selectedArtifact.kind === "markdown" ? (
                  <div className="flex-1 overflow-y-auto p-8">
                    <MarkdownContent content={selectedArtifact.content} theme={theme} />
                  </div>
                ) : (
                  <pre className="flex-1 overflow-auto p-8 text-sm font-mono whitespace-pre-wrap">
                    {selectedArtifact.content}
                  </pre>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center opacity-25">
                <FileCode className="w-12 h-12 mb-4" />
                <span className="text-xs uppercase font-bold tracking-wider">No Canvas Artifact Available</span>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Side Utilities */}
      <div
        className="w-16 border-l flex flex-col items-center py-8 gap-8"
        style={{ borderColor: theme.border, backgroundColor: theme.bg }}
      >
        <SideIcon icon={MessageSquare} theme={theme} active={!showCanvas} onClick={() => setShowCanvas(false)} />
        <SideIcon icon={FileCode} theme={theme} active={showCanvas} onClick={() => setShowCanvas(true)} />
        <SideIcon icon={Activity} theme={theme} />
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap');
        body { font-family: 'Inter', sans-serif; }
      `,
        }}
      />
    </div>
  );
}

function SideIcon({
  icon: Icon,
  theme,
  active,
  onClick,
}: { icon: any; theme: ThemeConfig; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="transition-colors"
      style={{ color: active ? theme.accent : `${theme.text}66` }}
    >
      <Icon className="w-5 h-5 hover:opacity-100" style={{ color: active ? theme.accent : theme.text }} />
    </button>
  );
}

const MarkdownContent = React.memo(({ content, theme }: { content: string; theme: ThemeConfig }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({ children }) => (
          <div className="my-8 overflow-x-auto border rounded-lg" style={{ borderColor: theme.border }}>
            <table className="w-full border-collapse text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-white/5 border-b" style={{ borderColor: theme.border }}>
            {children}
          </thead>
        ),
        th: ({ children }) => (
          <th className="px-6 py-3 text-left font-bold border-r last:border-r-0" style={{ borderColor: theme.border }}>
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td
            className="px-6 py-3 border-r last:border-r-0 border-b last:border-b-0"
            style={{ borderColor: theme.border }}
          >
            {children}
          </td>
        ),
        code({ node, inline, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || "");
          return !inline && match ? (
            <div
              className="my-8 border rounded overflow-hidden"
              style={{ borderColor: theme.border, backgroundColor: theme.surface }}
            >
              <div
                className="px-6 py-3 text-[10px] font-bold opacity-30 flex justify-between items-center border-b"
                style={{ borderColor: theme.border }}
              >
                <span>{match[1].toUpperCase()}</span>
                <Copy className="w-3 h-3 cursor-pointer" />
              </div>
              <SyntaxHighlighter
                {...props}
                style={vscDarkPlus}
                language={match[1]}
                PreTag="div"
                customStyle={{ margin: 0, padding: "1.5rem", fontSize: "0.9rem", background: "transparent" }}
              >
                {String(children).replace(/\n$/, "")}
              </SyntaxHighlighter>
            </div>
          ) : (
            <code
              className="px-1.5 py-0.5 rounded-sm bg-black/5 dark:bg-white/5 font-semibold"
              style={{ color: theme.accent }}
              {...props}
            >
              {children}
            </code>
          );
        },
        p: ({ children }) => <p className="mb-6 last:mb-0 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-8 mb-6 space-y-2">{children}</ul>,
        h1: ({ children }) => <h1 className="text-2xl font-bold mb-8 tracking-tight">{children}</h1>,
        h2: ({ children }) => <h2 className="text-xl font-bold mb-6 tracking-tight">{children}</h2>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
});
