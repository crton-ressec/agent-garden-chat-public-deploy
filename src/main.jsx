import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithRedirect, signOut as firebaseSignOut } from "firebase/auth";
import {
  ArrowUp,
  AtSign,
  Bot,
  Check,
  ChevronDown,
  CircleUserRound,
  Compass,
  FileText,
  Files,
  Image as ImageIcon,
  Link2,
  LoaderCircle,
  Menu,
  MessageSquarePlus,
  MoreHorizontal,
  Paperclip,
  PanelLeftClose,
  Plus,
  PanelLeftOpen,
  Route,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import "./styles.css";

const STORAGE_KEY = "agent-garden-current-chat";

const starters = [
  { icon: Compass, title: "Research a topic", prompt: "Research the current state of " },
  { icon: Files, title: "Analyze a file", prompt: "Analyze the attached file and tell me the most important findings." },
  { icon: Bot, title: "Plan a project", prompt: "Create a practical project plan for " },
  { icon: Sparkles, title: "Make something", prompt: "Help me create " },
];

function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function iconFor(name) {
  const icons = { Compass, Files, ShieldCheck, Sparkles, Bot, Settings2, FileText, Route };
  return icons[name] || Sparkles;
}

function PreviewText({ text }) {
  const pieces = String(text || "").split(/(```[\s\S]*?```)/g);
  return (
    <div className="message-copy">
      {pieces.map((piece, index) => {
        if (piece.startsWith("```")) {
          const code = piece.replace(/^```[\w-]*\n?/, "").replace(/```$/, "");
          return <pre key={index}><code>{code}</code></pre>;
        }
        return piece.split("\n").map((line, lineIndex) => {
          if (line.startsWith("### ")) return <h3 key={`${index}-${lineIndex}`}>{line.slice(4)}</h3>;
          if (line.startsWith("## ")) return <h2 key={`${index}-${lineIndex}`}>{line.slice(3)}</h2>;
          if (line.startsWith("# ")) return <h1 key={`${index}-${lineIndex}`}>{line.slice(2)}</h1>;
          if (/^[-*] /.test(line)) return <div className="list-line" key={`${index}-${lineIndex}`}><span>•</span>{line.slice(2)}</div>;
          return <React.Fragment key={`${index}-${lineIndex}`}>{line}{lineIndex < piece.split("\n").length - 1 && <br />}</React.Fragment>;
        });
      })}
    </div>
  );
}

function App() {
  const [config, setConfig] = useState({ agents: [], firebaseConfig: {}, configured: false });
  const [user, setUser] = useState(null);
  const [activeAgent, setActiveAgent] = useState("auto");
  const [provider, setProvider] = useState("gemini");
  const [input, setInput] = useState("");
  const [files, setFiles] = useState([]);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [railOpen, setRailOpen] = useState(true);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentLog, setAgentLog] = useState([]);
  const [signingIn, setSigningIn] = useState(false);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const endRef = useRef(null);

  const active = useMemo(
    () => config.agents.find((agent) => agent.id === activeAgent) || config.agents[0],
    [activeAgent, config.agents],
  );

  const fetchConfig = useCallback(async () => {
    const response = await fetch("/api/config");
    const data = await response.json();
    setConfig(data);
    if (data.agents?.length && !data.agents.some((agent) => agent.id === activeAgent)) setActiveAgent(data.agents[0].id);
  }, [activeAgent]);

  useEffect(() => {
    fetchConfig().catch(() => setNotice("Unable to load the application configuration."));
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => setUser(data.user || null))
      .catch(() => undefined);
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(saved)) setMessages(saved);
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [fetchConfig]);

  useEffect(() => {
    if (!config.firebaseConfig?.apiKey) return undefined;
    let activeEffect = true;
    const firebaseApp = getApps().length ? getApp() : initializeApp(config.firebaseConfig);
    const auth = getAuth(firebaseApp);
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser || !activeEffect) return;
      try {
        const idToken = await firebaseUser.getIdToken();
        const sessionResponse = await fetch("/api/auth/firebase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        });
        const data = await sessionResponse.json();
        if (!sessionResponse.ok) throw new Error(data.error || "Firebase Sign-In could not be completed.");
        if (activeEffect) setUser(data.user);
      } catch (error) {
        if (activeEffect) setNotice(error.message || "Firebase Sign-In could not be completed.");
      }
    });
    return () => { activeEffect = false; unsubscribe(); };
  }, [config.firebaseConfig?.apiKey]);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function signInWithGoogle() {
    setSigningIn(true);
    setNotice("");
    try {
      if (!config.firebaseConfig?.apiKey) throw new Error("Firebase web configuration is not available on this server.");
      const firebaseApp = getApps().length ? getApp() : initializeApp(config.firebaseConfig);
      const auth = getAuth(firebaseApp);
      await signInWithRedirect(auth, new GoogleAuthProvider());
    } catch (error) {
      setNotice(error.message || "Firebase Sign-In could not be completed.");
    } finally {
      setSigningIn(false);
    }
  }

  function startNewChat() {
    setMessages([]);
    setFiles([]);
    setInput("");
    setAgentLog([]);
    setNotice("");
    sessionStorage.removeItem(STORAGE_KEY);
    inputRef.current?.focus();
  }

  async function logout() {
    try {
      if (getApps().length) await firebaseSignOut(getAuth(getApp()));
    } finally {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      startNewChat();
    }
  }

  async function handleFiles(event) {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    const allowed = selected.slice(0, Math.max(0, 5 - files.length));
    const tooLarge = allowed.find((file) => file.size > 4.5 * 1024 * 1024);
    if (tooLarge) return setNotice(`${tooLarge.name} is larger than the 4.5 MB attachment limit.`);
    const converted = await Promise.all(allowed.map((file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        data: reader.result,
        size: file.size,
      });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    })));
    setFiles((current) => [...current, ...converted]);
    setNotice("");
  }

  async function sendMessage(forcedPrompt) {
    const message = (forcedPrompt ?? input).trim();
    if (!user) return setNotice("Sign in with Google before starting a chat.");
    if (!message && !files.length) return;
    if (sending) return;

    const outboundFiles = files;
    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message || "Please analyze the attached file(s).",
      files: outboundFiles.map((file) => ({ name: file.name, mimeType: file.mimeType, size: file.size })),
      createdAt: formatTime(),
    };
    const taskName = active?.label || "Coordinator";
    setMessages((current) => [...current, userMessage]);
    setAgentLog((current) => [...current, { id: crypto.randomUUID(), label: `${taskName} started`, status: "running", time: formatTime() }]);
    setInput("");
    setFiles([]);
    setSending(true);
    setNotice("");

    try {
      const result = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          agentId: activeAgent,
          provider,
          files: outboundFiles,
          history: messages.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error || "The provider did not return an answer.");
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer,
        provider: data.provider,
        agent: data.agent,
        sources: data.sources || [],
        fallbackReason: data.fallbackReason,
        researchNotice: data.researchNotice,
        routingReason: data.routingReason,
        createdAt: formatTime(),
      }]);
      const routedLabel = config.agents.find((agent) => agent.id === data.agent)?.label || taskName;
      setAgentLog((current) => current.map((item, index) => index === current.length - 1
        ? { ...item, label: `${taskName} → ${routedLabel} completed`, status: "done" }
        : item));
    } catch (error) {
      setNotice(error.message);
      setAgentLog((current) => current.map((item, index) => index === current.length - 1
        ? { ...item, label: `${taskName} needs attention`, status: "error" }
        : item));
    } finally {
      setSending(false);
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="app-shell">
      <aside className={`conversation-rail ${railOpen ? "open" : "closed"}`}>
        <div className="brand-line">
          <div className="brand-mark"><Sparkles size={18} strokeWidth={2.2} /></div>
          {railOpen && <span>Agent Garden</span>}
          <button className="icon-button rail-toggle" onClick={() => setRailOpen(!railOpen)} aria-label="Toggle sidebar">
            {railOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
        </div>
        <button className="new-chat" onClick={startNewChat}><MessageSquarePlus size={18} /><span>New chat</span></button>
        {railOpen && <>
          <div className="rail-section-label">Recent</div>
          <button className="recent-chat active"><span className="recent-dot" />Multi-agent workspace<span className="recent-menu"><MoreHorizontal size={16} /></span></button>
          <div className="rail-footnote">Chats and attachments stay in this browser session.</div>
        </>}
        <div className="rail-spacer" />
        {railOpen && <button className="settings-link"><Settings2 size={17} />Workspace settings</button>}
        <button className="account-chip" onClick={user ? logout : undefined} title={user ? "Sign out" : "Authentication required"}>
          {user?.picture ? <img src={user.picture} alt="" /> : <CircleUserRound size={23} />}
          {railOpen && <span>{user ? user.name : "Sign in required"}</span>}
          {railOpen && user && <ChevronDown size={15} />}
        </button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button className="mobile-menu icon-button" onClick={() => setRailOpen(!railOpen)}><Menu size={20} /></button>
          <div className="workspace-title"><span>Agent Garden</span><span className="title-divider">/</span><span className="muted-title">New conversation</span></div>
          <div className="topbar-actions">
            <button className="topbar-action"><Search size={17} /><span>Search</span></button>
            <button className="icon-button"><MoreHorizontal size={20} /></button>
          </div>
        </header>

        <section className="chat-stage">
          {isEmpty ? (
            <div className="welcome">
              <div className="welcome-kicker"><span className="pulse-dot" />Multi-provider workspace</div>
              <h1>Where should we begin?</h1>
              <p>Choose a specialist, attach context, and let the right model take the next step.</p>
              <div className="starter-grid">
                {starters.map(({ icon: Icon, title, prompt }) => (
                  <button className="starter-card" key={title} onClick={() => { setInput(prompt); inputRef.current?.focus(); }}>
                    <span className="starter-icon"><Icon size={19} /></span><span>{title}</span><ArrowUp size={16} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="message-stream">
              {messages.map((message) => (
                <article key={message.id} className={`message-row ${message.role}`}>
                  {message.role === "assistant" && <div className="agent-avatar"><Sparkles size={16} /></div>}
                  <div className="message-column">
                    <div className="message-meta">
                      <strong>{message.role === "user" ? user?.name || "You" : config.agents.find((agent) => agent.id === message.agent)?.label || "Agent"}</strong>
                      {message.provider && <span className="provider-pill">{message.provider}</span>}
                      <span>{message.createdAt}</span>
                    </div>
                    <PreviewText text={message.content} />
                    {message.files?.length > 0 && <div className="attached-list">{message.files.map((file) => <span key={file.name}><FileText size={14} />{file.name}</span>)}</div>}
                    {message.fallbackReason && <div className="fallback-note">{message.fallbackReason}</div>}
                    {message.researchNotice && <div className="fallback-note">{message.researchNotice}</div>}
                    {message.routingReason && <div className="routing-note"><Sparkles size={13} />{message.routingReason}</div>}
                    {message.sources?.length > 0 && <div className="sources"><span className="sources-heading"><Link2 size={14} />Sources</span>{message.sources.map((source, index) => <a key={source.uri} href={source.uri} target="_blank" rel="noreferrer"><span>[{index + 1}]</span>{source.title}</a>)}</div>}
                  </div>
                </article>
              ))}
              {sending && <article className="message-row assistant"><div className="agent-avatar"><Sparkles size={16} /></div><div className="thinking"><LoaderCircle className="spin" size={17} />{active?.label || "Agent"} is working…</div></article>}
              <div ref={endRef} />
            </div>
          )}
        </section>

        <section className="composer-zone">
          <div className="composer-wrap">
            {files.length > 0 && <div className="file-chips">{files.map((file, index) => <div className="file-chip" key={`${file.name}-${index}`}><span className="file-type">{file.mimeType.startsWith("image/") ? <ImageIcon size={16} /> : <FileText size={16} />}</span><span>{file.name}</span><button onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${file.name}`}><X size={14} /></button></div>)}</div>}
            <div className="composer">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }}
                placeholder={user ? `Ask ${active?.label || "an agent"} anything…` : "Sign in with Google to start a chat"}
                disabled={!user || sending}
                rows={1}
              />
              <div className="composer-toolbar">
                <div className="composer-tools">
                  <input ref={fileInputRef} className="hidden-input" type="file" multiple onChange={handleFiles} accept=".txt,.md,.pdf,.doc,.docx,.csv,.json,.js,.jsx,.ts,.tsx,.py,.html,.css,image/*" />
                  <button className="tool-button" onClick={() => fileInputRef.current?.click()} disabled={!user || sending} title="Add files"><Paperclip size={18} /></button>
                  <button className="tool-button" disabled title="Mention an agent"><AtSign size={18} /></button>
                  <div className="provider-select"><span className={`status-dot ${provider}`} /><select value={provider} onChange={(event) => setProvider(event.target.value)} disabled={!user || sending}><option value="gemini">Gemini (automatic fallback)</option><option value="pollinations">Pollinations only</option></select></div>
                </div>
                <button className={`send-button ${input.trim() || files.length ? "ready" : ""}`} onClick={() => sendMessage()} disabled={!user || sending || (!input.trim() && !files.length)} aria-label="Send message">{sending ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}</button>
              </div>
            </div>
            <div className="composer-disclaimer">Agent Garden can make mistakes. Verify important information. <span>Attachments are sent only to the selected model.</span></div>
          </div>
        </section>
      </main>

      <aside className="agent-drawer">
        <div className="drawer-header"><div><span className="eyebrow">Specialists</span><h2>Agent desk</h2></div><button className="icon-button" onClick={() => setAgentOpen(!agentOpen)}>{agentOpen ? <X size={18} /> : <Plus size={18} />}</button></div>
        <div className="active-agent-card">
          <div className="agent-icon"><Sparkles size={17} /></div>
          <div><span>Active agent</span><strong>{active?.label || "Loading…"}</strong><p>{active?.description}</p></div>
        </div>
        <div className="agent-list">
          {config.agents.map((agent) => {
            const Icon = iconFor(agent.icon);
            return <button key={agent.id} onClick={() => { setActiveAgent(agent.id); setAgentOpen(false); }} className={`agent-option ${agent.id === activeAgent ? "selected" : ""}`}><span className="agent-option-icon"><Icon size={17} /></span><span><strong>{agent.label}</strong><small>{agent.provider}</small></span>{agent.id === activeAgent && <Check size={16} />}</button>;
          })}
        </div>
        <div className="activity-log"><div className="activity-title"><span>Activity</span><span className="live-status"><i />Live</span></div>{agentLog.length === 0 ? <div className="empty-activity">Your agent activity will appear here.</div> : agentLog.slice(-4).reverse().map((item) => <div className="activity-item" key={item.id}><span className={`activity-state ${item.status}`} /> <div>{item.label}<small>{item.time}</small></div></div>)}</div>
      </aside>

      {!user && <div className="auth-overlay"><div className="auth-card"><div className="auth-mark"><Sparkles size={23} /></div><span className="eyebrow">Firebase-powered workspace</span><h2>Sign up or sign in to continue</h2><p>Use your Google account to create or access your Agent Garden account. Firebase handles authentication; the app does not request Gmail, Drive, or other Google data.</p>{config.firebaseConfig?.apiKey ? <button className="firebase-button" onClick={signInWithGoogle} disabled={signingIn}><Sparkles size={18} /><span>{signingIn ? "Connecting…" : "Continue with Google"}</span></button> : <div className="setup-warning"><strong>Firebase Authentication needs configuration.</strong><span>Add the Firebase web configuration and Admin service-account variables in Render, then reload this page.</span></div>}{notice && <div className="notice error">{notice}</div>}<small>Authentication is provided by Firebase. Agent Garden is an independently built workspace.</small></div></div>}
      {notice && user && <div className="notice toast error"><button onClick={() => setNotice("")}><X size={14} /></button>{notice}</div>}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
