import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, setPersistence, signInWithRedirect, signOut as firebaseSignOut } from "firebase/auth";
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
  Copy,
  Download,
  Paperclip,
  RefreshCw,
  Trash2,
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

const ONBOARDING_SECTIONS = [
  { id: "about", title: "About you", description: "Help the workspace understand your preferred identity and context.", questions: [
    { key: "preferredName", label: "What should Agent Garden call you?", placeholder: "Your preferred name" },
    { key: "location", label: "Where are you generally located?", placeholder: "Country, region, or time zone" },
    { key: "languages", label: "Which languages should responses use?", placeholder: "English, French, etc." },
  ] },
  { id: "work", title: "Work and study", description: "Share the kinds of work where a specialist workspace can help.", questions: [
    { key: "role", label: "What do you do or study?", placeholder: "Role, field, or program" },
    { key: "projects", label: "What are you working on lately?", placeholder: "Projects, responsibilities, or interests" },
    { key: "tools", label: "Which tools or technologies do you use?", placeholder: "Apps, languages, platforms" },
  ] },
  { id: "preferences", title: "Communication preferences", description: "Choose how the agents should communicate with you.", questions: [
    { key: "tone", label: "What tone do you prefer?", placeholder: "Direct, friendly, academic, concise…" },
    { key: "detail", label: "How much detail should answers include?", placeholder: "Brief by default, thorough when needed…" },
    { key: "format", label: "What formats help you most?", placeholder: "Steps, tables, examples, code…" },
  ] },
  { id: "goals", title: "Goals and support", description: "Tell the workspace what good assistance looks like.", questions: [
    { key: "goals", label: "What would you like to accomplish?", placeholder: "Learning, building, organizing, creating…" },
    { key: "challenges", label: "What tends to slow you down?", placeholder: "Research, focus, debugging, writing…" },
    { key: "success", label: "How will you know the workspace helped?", placeholder: "A finished project, clarity, saved time…" },
  ] },
  { id: "boundaries", title: "Boundaries and memory", description: "Decide what may be remembered and used for personalization.", questions: [
    { key: "avoid", label: "Anything the agents should avoid assuming?", placeholder: "Optional boundaries or context" },
    { key: "sensitive", label: "Anything you want kept out of AI memory?", placeholder: "Optional; do not share secrets or credentials" },
    { key: "notes", label: "Anything else you want the workspace to know?", placeholder: "Optional notes" },
  ] },
];

function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function iconFor(name) {
  const icons = { Compass, Files, ShieldCheck, Sparkles, Bot, Settings2, FileText, Route };
  return icons[name] || Sparkles;
}

function InlineMarkdown({ text }) {
  const tokens = String(text || "").split(/(\[[^\]]+\]\([^\)]+\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g).filter(Boolean);
  return tokens.map((token, index) => {
    const link = token.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    if (token.startsWith("`") && token.endsWith("`")) return <code className="inline-code" key={index}>{token.slice(1, -1)}</code>;
    if ((token.startsWith("**") && token.endsWith("**")) || (token.startsWith("__") && token.endsWith("__"))) return <strong key={index}>{token.slice(2, -2)}</strong>;
    if ((token.startsWith("*") && token.endsWith("*")) || (token.startsWith("_") && token.endsWith("_"))) return <em key={index}>{token.slice(1, -1)}</em>;
    return <Fragment key={index}>{token}</Fragment>;
  });
}

function PreviewText({ text }) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    if (!lines[index].trim()) { index += 1; continue; }
    if (lines[index].startsWith("```")) {
      const language = lines[index].slice(3).trim(); const code = []; index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) code.push(lines[index++]);
      index += 1; blocks.push({ type: "code", language, value: code.join("\n") }); continue;
    }
    if (/^\|.*\|$/.test(lines[index]) && index + 1 < lines.length && /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(lines[index + 1])) {
      const headers = lines[index].split("|").slice(1, -1).map((cell) => cell.trim()); index += 2; const rows = [];
      while (index < lines.length && /^\|.*\|$/.test(lines[index])) { rows.push(lines[index].split("|").slice(1, -1).map((cell) => cell.trim())); index += 1; }
      blocks.push({ type: "table", headers, rows }); continue;
    }
    const heading = lines[index].match(/^(#{1,6})\s+(.+)$/); if (heading) { blocks.push({ type: "heading", level: heading[1].length, value: heading[2] }); index += 1; continue; }
    if (/^>\s?/.test(lines[index])) { const quote = []; while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, "")); blocks.push({ type: "quote", value: quote.join(" ") }); continue; }
    if (/^[-*+]\s+/.test(lines[index])) { const items = []; while (index < lines.length && /^[-*+]\s+/.test(lines[index])) items.push(lines[index++].replace(/^[-*+]\s+/, "")); blocks.push({ type: "ul", items }); continue; }
    if (/^\d+[.)]\s+/.test(lines[index])) { const items = []; while (index < lines.length && /^\d+[.)]\s+/.test(lines[index])) items.push(lines[index++].replace(/^\d+[.)]\s+/, "")); blocks.push({ type: "ol", items }); continue; }
    const paragraph = [lines[index++]]; while (index < lines.length && lines[index].trim() && !/^(#{1,6})\s+|^```|^>\s?|^[-*+]\s+|^\d+[.)]\s+|^\|.*\|$/.test(lines[index])) paragraph.push(lines[index++]); blocks.push({ type: "p", value: paragraph.join(" ") });
  }
  return <div className="message-copy">{blocks.map((block, blockIndex) => {
    if (block.type === "code") return <div className="code-block" key={blockIndex}><div className="code-label">{block.language || "code"}</div><pre><code>{block.value}</code></pre></div>;
    if (block.type === "heading") { const Tag = `h${Math.min(6, block.level)}`; return <Tag key={blockIndex}><InlineMarkdown text={block.value} /></Tag>; }
    if (block.type === "quote") return <blockquote key={blockIndex}><InlineMarkdown text={block.value} /></blockquote>;
    if (block.type === "ul") return <ul key={blockIndex}>{block.items.map((item, itemIndex) => <li key={itemIndex}><InlineMarkdown text={item} /></li>)}</ul>;
    if (block.type === "ol") return <ol key={blockIndex}>{block.items.map((item, itemIndex) => <li key={itemIndex}><InlineMarkdown text={item} /></li>)}</ol>;
    if (block.type === "table") return <div className="table-scroll" key={blockIndex}><table><thead><tr>{block.headers.map((header) => <th key={header}><InlineMarkdown text={header} /></th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{block.headers.map((_, cellIndex) => <td key={cellIndex}><InlineMarkdown text={row[cellIndex] || ""} /></td>)}</tr>)}</tbody></table></div>;
    return <p key={blockIndex}><InlineMarkdown text={block.value} /></p>;
  })}</div>;
}

function App() {
  const [config, setConfig] = useState({ agents: [], firebaseConfig: {}, configured: false, authRequired: true, testUser: null });
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
  const [authDiagnostics, setAuthDiagnostics] = useState(null);
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [accountForm, setAccountForm] = useState({ name: "", email: "", password: "" });
  const [accountBusy, setAccountBusy] = useState(false);
  const [profile, setProfile] = useState(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingSection, setOnboardingSection] = useState(0);
  const [onboardingAnswers, setOnboardingAnswers] = useState({});
  const [aiMemoryEnabled, setAiMemoryEnabled] = useState(false);
  const [sectionMemory, setSectionMemory] = useState(Object.fromEntries(ONBOARDING_SECTIONS.map((section) => [section.id, true])));
  const [profileLoading, setProfileLoading] = useState(false);
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealText, setAppealText] = useState("");
  const [appealBusy, setAppealBusy] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminData, setAdminData] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminPasswordOpen, setAdminPasswordOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState("");
  const [adminPasswordBusy, setAdminPasswordBusy] = useState(false);
  const [workspaceFiles, setWorkspaceFiles] = useState([]);
  const [filesOpen, setFilesOpen] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [chatId, setChatId] = useState(null);
  const [chatTitle, setChatTitle] = useState("New conversation");
  const [recentChats, setRecentChats] = useState([]);
  const [recentChatsLoading, setRecentChatsLoading] = useState(false);
  const [chatExecutionLive, setChatExecutionLive] = useState(null);
  const [e2bOpen, setE2bOpen] = useState(false);
  const [e2bLanguage, setE2bLanguage] = useState("python");
  const [e2bCode, setE2bCode] = useState("print('Hello from Agent Garden')");
  const [e2bOutput, setE2bOutput] = useState("");
  const [e2bBusy, setE2bBusy] = useState(false);
  const [e2bPhase, setE2bPhase] = useState("idle");
  const [e2bStartedAt, setE2bStartedAt] = useState(null);
  const [e2bElapsed, setE2bElapsed] = useState(0);
  const [e2bExecutionId, setE2bExecutionId] = useState(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const endRef = useRef(null);

  const active = useMemo(
    () => config.agents.find((agent) => agent.id === activeAgent) || config.agents[0],
    [activeAgent, config.agents],
  );

  const fetchConfig = useCallback(async () => {
    const response = await fetch(`/api/config?client=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    setConfig(data);
    if (data.authRequired === false) setUser(data.testUser || { sub: "temporary-test-user", name: "Temporary test user", email: "test-mode@agent-garden.local" });
    if (data.agents?.length && !data.agents.some((agent) => agent.id === activeAgent)) setActiveAgent(data.agents[0].id);
  }, [activeAgent]);

  useEffect(() => {
    fetchConfig().catch(() => setNotice("Unable to load the application configuration."));
    fetch(`/api/auth/me?client=${Date.now()}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setUser(data.user || (data.authRequired === false ? data.testUser : null)))
      .catch(() => undefined);
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
      if (Array.isArray(saved)) setMessages(saved);
      else if (saved && typeof saved === "object") {
        if (Array.isArray(saved.messages)) setMessages(saved.messages);
        if (saved.chatId) setChatId(saved.chatId);
        if (saved.chatTitle) setChatTitle(saved.chatTitle);
      }
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [fetchConfig]);

  useEffect(() => {
    if (!config.authRequired || !config.firebaseConfig?.apiKey) return undefined;
    let activeEffect = true;
    let auth;
    try {
      const firebaseApp = getApps().length ? getApp() : initializeApp(config.firebaseConfig);
      auth = getAuth(firebaseApp);
    } catch (error) {
      setNotice(error.message || "Firebase could not be initialized.");
      return undefined;
    }
    const safeError = (error) => ({
      name: error?.name || "Error",
      code: error?.code || null,
      message: error?.message || String(error),
    });
    const updateDiagnostics = (patch) => {
      if (!activeEffect) return;
      const event = { ...patch, capturedAt: new Date().toISOString() };
      setAuthDiagnostics((current) => ({ latest: event, events: [...(current?.events || []), event].slice(-40) }));
    };
    const inspectClientState = async () => {
      let localStorageKeys = [];
      let sessionStorageKeys = [];
      let indexedDbNames = [];
      try { localStorageKeys = Object.keys(localStorage).filter((key) => /firebase|auth|agent/i.test(key)); } catch (error) { localStorageKeys = [`blocked:${error?.name || "storage-error"}`]; }
      try { sessionStorageKeys = Object.keys(sessionStorage).filter((key) => /firebase|auth|agent/i.test(key)); } catch (error) { sessionStorageKeys = [`blocked:${error?.name || "storage-error"}`]; }
      try { indexedDbNames = (await indexedDB.databases()).map((item) => item.name).filter(Boolean).filter((name) => /firebase|auth|agent/i.test(name)); } catch (error) { indexedDbNames = [`unavailable:${error?.name || "indexeddb-error"}`]; }
      return { localStorageKeys, sessionStorageKeys, indexedDbNames, referrerOrigin: document.referrer ? new URL(document.referrer).origin : null, userAgent: navigator.userAgent, online: navigator.onLine, authDomain: auth.config?.authDomain || null, projectId: auth.config?.apiKey ? config.firebaseConfig.projectId : null };
    };
    const exchangeFirebaseUser = async (firebaseUser, source = "auth-state") => {
      if (!firebaseUser || !activeEffect) return;
      updateDiagnostics({ stage: "firebase-user-received", userSource: source, firebaseUser: { uidPresent: Boolean(firebaseUser.uid), emailPresent: Boolean(firebaseUser.email), providerIds: firebaseUser.providerData?.map((item) => item.providerId) || [] } });
      try {
        const idToken = await firebaseUser.getIdToken();
        updateDiagnostics({ stage: "sending-token-to-server", tokenCreated: true });
        const sessionResponse = await fetch(`/api/auth/firebase?client=${Date.now()}`, {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        });
        const data = await sessionResponse.json().catch(() => ({}));
        updateDiagnostics({ stage: sessionResponse.ok ? "server-session-created" : "server-session-rejected", exchange: { httpStatus: sessionResponse.status, ok: sessionResponse.ok, response: data.user ? { userReturned: true, uidPresent: Boolean(data.user.uid), emailPresent: Boolean(data.user.email) } : { error: data.error || null } } });
        if (!sessionResponse.ok) throw new Error(data.error || "Firebase Sign-In could not be completed.");
        if (activeEffect) setUser(data.user);
      } catch (error) {
        updateDiagnostics({ stage: "authentication-error", error: safeError(error) });
        if (activeEffect) setNotice(error.message || "Firebase Sign-In could not be completed.");
      }
    };
    (async () => {
      try {
        updateDiagnostics({ stage: "waiting-for-firebase", configLoaded: true, persistenceRequested: "browserLocalPersistence", currentUrl: window.location.origin + window.location.pathname, redirectPendingMarker: sessionStorage.getItem("agent_garden_redirect_pending") === "1", clientState: await inspectClientState() });
        await auth.authStateReady();
        const redirectResult = await getRedirectResult(auth);
        updateDiagnostics({ stage: redirectResult?.user || auth.currentUser ? "redirect-result-found" : "redirect-result-empty", redirectResult: { userReturned: Boolean(redirectResult?.user), credentialPresent: Boolean(redirectResult?.credential), operationType: redirectResult?.operationType || null }, currentUserPresent: Boolean(auth.currentUser), afterAuthStateReady: await inspectClientState() });
        sessionStorage.removeItem("agent_garden_redirect_pending");
        if (redirectResult?.user) await exchangeFirebaseUser(redirectResult.user, "redirect-result");
        else if (auth.currentUser) await exchangeFirebaseUser(auth.currentUser, "current-user");
      } catch (error) {
        updateDiagnostics({ stage: "redirect-processing-error", error: safeError(error) });
        if (activeEffect) setNotice(error.message || "Firebase redirect sign-in could not be completed.");
      }
    })();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => { updateDiagnostics({ authStateListener: firebaseUser ? "user-received" : "null-received", listenerUserPresent: Boolean(firebaseUser) }); exchangeFirebaseUser(firebaseUser); });
    return () => { activeEffect = false; unsubscribe(); };
  }, [config.firebaseConfig?.apiKey]);

  useEffect(() => {
    if (!user || !config.authRequired || user.sub === "temporary-test-user") return undefined;
    let cancelled = false;
    setProfileLoading(true);
    fetch(`/api/profile?client=${Date.now()}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (cancelled || !data) return;
        const normalizedUser = { ...user, ...(data.user || {}), onboardingComplete: Boolean(data.user?.onboardingComplete ?? data.user?.onboarding_complete ?? user.onboardingComplete), aiMemoryEnabled: Boolean(data.user?.aiMemoryEnabled ?? data.user?.ai_memory_enabled ?? user.aiMemoryEnabled) };
        setProfile({ ...data, user: normalizedUser });
        setUser((current) => ({ ...(current || {}), ...normalizedUser }));
        const answers = {};
        (data.answers || []).forEach((answer) => { answers[`${answer.section}.${answer.key}`] = answer.value; });
        setOnboardingAnswers(answers);
        setAiMemoryEnabled(normalizedUser.aiMemoryEnabled);
        setOnboardingOpen(!normalizedUser.onboardingComplete);
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setProfileLoading(false); });
    return () => { cancelled = true; };
  }, [user, config.authRequired]);

  const userId = user?.sub || null;
  const suspended = String(profile?.user?.status || user?.status || "active") === "suspended";
  const suspensionReason = profile?.user?.suspension_reason || user?.suspension_reason || profile?.user?.reason || user?.reason || "Your account is temporarily unavailable.";

  const submitAppeal = useCallback(async () => {
    if (appealText.trim().length < 10) return setNotice("Please explain your appeal in at least 10 characters.");
    setAppealBusy(true);
    try {
      const response = await fetch("/api/appeals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: appealText }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not submit the appeal.");
      setAppealOpen(false); setAppealText(""); setNotice("Your appeal was submitted for admin review.");
    } catch (error) { setNotice(error.message); } finally { setAppealBusy(false); }
  }, [appealText]);

  const loadAdminData = useCallback(async () => {
    setAdminLoading(true);
    try {
      const response = await fetch("/api/admin/overview", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load moderation data.");
      setAdminData(data); setAdminOpen(true);
    } catch (error) { setNotice(error.message); } finally { setAdminLoading(false); }
  }, []);

  const resetAdminPassword = useCallback(async () => {
    if (adminPassword.length < 12) return setNotice("Use an admin password of at least 12 characters.");
    if (adminPassword !== adminPasswordConfirm) return setNotice("The password confirmation does not match.");
    setAdminPasswordBusy(true); setNotice("");
    try {
      const response = await fetch("/api/admin/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: adminPassword }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not update the admin password.");
      setAdminPassword(""); setAdminPasswordConfirm(""); setAdminPasswordOpen(false); setNotice("Admin password updated. You can now sign in with email and password.");
    } catch (error) { setNotice(error.message); } finally { setAdminPasswordBusy(false); }
  }, [adminPassword, adminPasswordConfirm]);
  const decideAppeal = useCallback(async (appeal, status) => {
    const responseText = status === "denied" ? window.prompt("Response from admin:") || "Appeal denied after review." : "Your appeal was approved by the admin.";
    const response = await fetch(`/api/admin/appeals/${encodeURIComponent(appeal.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, response: responseText }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not decide the appeal.");
    await loadAdminData();
  }, [loadAdminData]);

  const loadWorkspaceFiles = useCallback(async () => {
    if (!userId) return;
    setFilesLoading(true);
    try {
      const response = await fetch(`/api/storage/files?client=${Date.now()}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load workspace files.");
      setWorkspaceFiles(data.files || []);
    } catch (error) { setNotice(error.message); }
    finally { setFilesLoading(false); }
  }, [userId]);

  useEffect(() => { if (userId) loadWorkspaceFiles(); }, [userId, loadWorkspaceFiles]);

  const loadRecentChats = useCallback(async () => {
    if (!userId) return;
    setRecentChatsLoading(true);
    try {
      const response = await fetch(`/api/chats?client=${Date.now()}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load recent conversations.");
      setRecentChats(Array.isArray(data.chats) ? data.chats : []);
    } catch (error) { setNotice(error.message); }
    finally { setRecentChatsLoading(false); }
  }, [userId]);

  useEffect(() => { if (userId) loadRecentChats(); }, [userId, loadRecentChats]);

  async function openRecentChat(chat) {
    if (!chat?.id || sending) return;
    try {
      const response = await fetch(`/api/chats/${encodeURIComponent(chat.id)}?client=${Date.now()}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not open that conversation.");
      const normalized = (data.messages || []).map((item) => ({ id: item.id, role: item.role, content: item.content, agent: item.agent_id || "coordinator", provider: item.provider || "gemini", createdAt: item.created_at ? formatTime(new Date(item.created_at)) : formatTime() }));
      setChatId(chat.id);
      setChatTitle(chat.title || "New conversation");
      setMessages(normalized);
      setFiles([]);
      setAgentLog([]);
      setNotice("");
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ chatId: chat.id, chatTitle: chat.title || "New conversation", messages: normalized }));
    } catch (error) { setNotice(error.message); }
  }

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ chatId, chatTitle, messages }));
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, chatId, chatTitle]);

  async function signInWithGoogle() {
    setSigningIn(true);
    setNotice("");
    try {
      if (!config.firebaseConfig?.apiKey) throw new Error("Firebase web configuration is not available on this server.");
      const firebaseApp = getApps().length ? getApp() : initializeApp(config.firebaseConfig);
      const auth = getAuth(firebaseApp);
      await setPersistence(auth, browserLocalPersistence);
      const event = { stage: "redirect-started", persistenceRequested: "browserLocalPersistence", currentUrl: window.location.origin + window.location.pathname, capturedAt: new Date().toISOString() };
      setAuthDiagnostics({ latest: event, events: [event] });
      sessionStorage.setItem("agent_garden_redirect_pending", "1");
      await signInWithRedirect(auth, new GoogleAuthProvider());
    } catch (error) {
      setNotice(error.message || "Firebase Sign-In could not be completed.");
    } finally {
      setSigningIn(false);
    }
  }

  async function submitAccount(event) {
    event.preventDefault();
    setAccountBusy(true);
    setNotice("");
    try {
      const endpoint = authMode === "signup" ? "/api/auth/password/signup" : "/api/auth/password/login";
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(accountForm) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Account authentication failed.");
      setUser(data.user);
      setAccountForm({ name: "", email: "", password: "" });
      setOnboardingOpen(authMode === "signup" || !data.user.onboardingComplete);
    } catch (error) { setNotice(error.message); }
    finally { setAccountBusy(false); }
  }

  async function saveOnboarding() {
    setAccountBusy(true);
    setNotice("");
    try {
      const answers = ONBOARDING_SECTIONS.flatMap((section) => section.questions.map((question) => ({ section: section.id, key: question.key, value: onboardingAnswers[`${section.id}.${question.key}`] || "", aiInclude: Boolean(aiMemoryEnabled && sectionMemory[section.id]) })));
      const response = await fetch("/api/profile/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers, aiMemoryEnabled, completed: true }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save your onboarding profile.");
      setUser((current) => ({ ...(current || {}), onboardingComplete: true, aiMemoryEnabled: Boolean(aiMemoryEnabled) }));
      setProfile((current) => ({ ...(current || {}), user: { ...(current?.user || {}), onboardingComplete: true, aiMemoryEnabled: Boolean(aiMemoryEnabled) } }));
      setOnboardingSection(0);
      setOnboardingOpen(false);
      setNotice("Your personalization settings were saved.");
    } catch (error) { setNotice(error.message); }
    finally { setAccountBusy(false); }
  }

  async function resetGoogleState() {
    try {
      const auth = getAuth(getApp());
      await firebaseSignOut(auth);
      Object.keys(localStorage).filter((key) => /firebase|auth/i.test(key)).forEach((key) => localStorage.removeItem(key));
      sessionStorage.removeItem("agent_garden_redirect_pending");
      setUser(null);
      setNotice("");
      const event = { stage: "local-auth-state-reset", resetLocalStorage: true, resetSessionMarker: true, capturedAt: new Date().toISOString() };
      setAuthDiagnostics({ latest: event, events: [event] });
    } catch (error) {
      const event = { stage: "auth-state-reset-error", error: { name: error?.name || "Error", code: error?.code || null, message: error?.message || String(error) }, capturedAt: new Date().toISOString() };
      setAuthDiagnostics({ latest: event, events: [event] });
      setNotice(error.message || "Could not reset local Google sign-in state.");
    }
  }

  async function copyDiagnostics() {
    if (!authDiagnostics) return;
    const report = JSON.stringify(authDiagnostics, null, 2);
    try {
      await navigator.clipboard.writeText(report);
      setDiagnosticsCopied(true);
      window.setTimeout(() => setDiagnosticsCopied(false), 1800);
    } catch {
      setNotice("Your browser blocked clipboard access. Select and copy the diagnostic text manually.");
    }
  }

  function startNewChat() {
    setMessages([]);
    setFiles([]);
    setInput("");
    setAgentLog([]);
    setNotice("");
    sessionStorage.removeItem(STORAGE_KEY);
    setChatId(null);
    setChatTitle("New conversation");
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
    const stored = await Promise.all(converted.map(async (file) => {
      try {
        const uploadResponse = await fetch("/api/storage/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, contentType: file.mimeType, data: file.data }) });
        const uploadData = await uploadResponse.json().catch(() => ({}));
        if (!uploadResponse.ok) return file;
        return { ...file, storageKey: uploadData.key, storageStatus: "stored" };
      } catch { return file; }
    }));
    setFiles((current) => [...current, ...stored]);
    if (stored.some((file) => file.storageStatus === "stored")) loadWorkspaceFiles();
    setNotice(stored.some((file) => file.storageStatus !== "stored") ? "The file is attached for this chat, but cloud storage is not currently available." : "");
  }

  useEffect(() => {
    if (!chatExecutionLive?.active || !chatExecutionLive.startedAt) return undefined;
    const timer = window.setInterval(() => setChatExecutionLive((current) => current ? { ...current, elapsed: Math.max(0, Math.round((Date.now() - current.startedAt) / 1000)) } : current), 250);
    return () => window.clearInterval(timer);
  }, [chatExecutionLive?.active, chatExecutionLive?.startedAt]);

  useEffect(() => {
    if (!chatExecutionLive?.active || !chatExecutionLive.id) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/e2b/progress/${encodeURIComponent(chatExecutionLive.id)}?client=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setChatExecutionLive((current) => current ? { ...current, ...data, elapsed: Math.max(0, Math.round((Date.now() - (current.startedAt || Date.now())) / 1000)) } : current);
      } catch { /* the completed chat response still contains the full transcript */ }
    };
    poll();
    const timer = window.setInterval(poll, 300);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [chatExecutionLive?.active, chatExecutionLive?.id]);

  useEffect(() => {
    if (!e2bBusy || !e2bStartedAt) return undefined;
    const timer = window.setInterval(() => setE2bElapsed(Math.max(0, Math.round((Date.now() - e2bStartedAt) / 1000))), 250);
    return () => window.clearInterval(timer);
  }, [e2bBusy, e2bStartedAt]);

  useEffect(() => {
    if (!e2bBusy || !e2bExecutionId) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/e2b/progress/${encodeURIComponent(e2bExecutionId)}?client=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) {
          setE2bPhase(data.phase === "finalizing" ? "finalizing" : data.phase === "completed" ? "complete" : "running");
          setE2bOutput([data.stdout && `STDOUT\n${data.stdout}`, data.stderr && `STDERR\n${data.stderr}`, data.exitCode !== undefined && `Exit code: ${data.exitCode}`].filter(Boolean).join("\n\n"));
        }
      } catch { /* final response still updates the modal */ }
    };
    poll();
    const timer = window.setInterval(poll, 300);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [e2bBusy, e2bExecutionId]);

  async function saveMessageAsFile(message) {
    try {
      const response = await fetch("/api/storage/create-text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `agent-garden-${new Date().toISOString().slice(0, 10)}.md`, content: message.content }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save this response.");
      await loadWorkspaceFiles(); setFilesOpen(true); setNotice("Saved the response to Workspace files.");
    } catch (error) { setNotice(error.message); }
  }

  async function deleteWorkspaceFile(file) {
    try {
      const response = await fetch("/api/storage/object", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: file.key }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not delete the file.");
      setWorkspaceFiles((current) => current.filter((item) => item.key !== file.key));
    } catch (error) { setNotice(error.message); }
  }

  async function runInE2B() {
    const executionId = crypto.randomUUID();
    setE2bExecutionId(executionId); setE2bBusy(true); setE2bPhase("provisioning"); setE2bStartedAt(Date.now()); setE2bElapsed(0); setE2bOutput("");
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      setE2bPhase("running");
      const response = await fetch("/api/e2b/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: e2bLanguage, code: e2bCode, timeoutMs: 20000, executionId }) });
      setE2bPhase("finalizing");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "E2B execution failed.");
      setE2bOutput([data.stdout && `STDOUT\n${data.stdout}`, data.stderr && `STDERR\n${data.stderr}`, `Exit code: ${data.exitCode}`].filter(Boolean).join("\n\n"));
      setE2bPhase("complete");
    } catch (error) { setE2bOutput(`Error: ${error.message}`); setE2bPhase("error"); }
    finally { setE2bBusy(false); }
  }

  async function sendMessage(forcedPrompt) {
    const message = (forcedPrompt ?? input).trim();
    if (config.authRequired && !user) return setNotice("Sign in with Google before starting a chat.");
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
    const casualMessage = /^(hi|hello|hey|yo|sup|what's up|how are you|thanks|thank you|good morning|good evening)[!.?, ]*$/i.test(message);
    const capabilityQuestion = /^(can|could|does|do|is|are|will|what|how)\b[\s\S]{0,100}\b(run|execute|use|access|support)\b[\s\S]{0,60}\b(python|python3|javascript|node|bash|shell|code|script)\b[\s\S]*\?*$/i.test(message);
    const executionIntent = !casualMessage && !capabilityQuestion && ((/\b(run|execute|test|plot|chart|graph|visuali[sz]e|use|open|access|create|write|save|install|download|convert|calculate|inspect|check|debug|make|generate|package|zip|archive|bundle)\b[\s\S]{0,120}\b(terminal|computer|sandbox|machine|environment|python|python3|javascript|node|bash|shell|command|code|script|file|files|folder|package|data|csv|json|image|chart|plot|archive|zip|test files?)\b/i.test(message)) || /```(?:python|py|javascript|js|node|bash|sh)?/i.test(message) || (/\b(command|terminal|sandbox|computer|zip|archive)\b/i.test(message) && /\b(please|can you|i want|need you|make|run|do|create|generate)\b/i.test(message)));
    const executionId = executionIntent ? crypto.randomUUID() : null;
    if (executionIntent) setChatExecutionLive({ id: executionId, active: true, phase: "provisioning", elapsed: 0, startedAt: Date.now(), stdout: "", stderr: "", command: "ubuntu@sandbox:~$ preparing E2B command" });

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
          chatId,
          executionId,
        }),
      });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error || "The provider did not return an answer.");
      if (data.chatId) setChatId(data.chatId);
      if (!chatId) setChatTitle(data.chatTitle || message.slice(0, 60) || "New conversation");
      if (data.persistenceNotice) setNotice(data.persistenceNotice);
      loadRecentChats();
      if (data.execution) setChatExecutionLive((current) => ({ ...(current || {}), ...data.execution, active: false, phase: data.execution.status === "awaiting_code" ? "awaiting_code" : "completed", elapsed: Math.round((data.execution.durationMs || 0) / 1000) }));
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer,
        provider: data.provider,
        agent: data.agent,
        sources: data.sources || [],
        execution: data.execution || null,
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
        <button className="files-nav-button" onClick={() => { setFilesOpen(true); loadWorkspaceFiles(); }}><Files size={18} />{railOpen && <span>Workspace files</span>}<span className="files-count">{workspaceFiles.length || ""}</span></button>
        {railOpen && <>
          <div className="rail-section-label">Recent</div>
          {recentChatsLoading && <div className="rail-footnote">Loading conversations…</div>}
          {!recentChatsLoading && recentChats.length === 0 && <div className="rail-footnote">Your conversations will appear here.</div>}
          {!recentChatsLoading && recentChats.slice(0, 12).map((chat) => <button key={chat.id} className={`recent-chat ${chat.id === chatId ? "active" : ""}`} onClick={() => openRecentChat(chat)} title={chat.title || "New conversation"}><span className="recent-dot" /><span className="recent-chat-title">{chat.title || "New conversation"}</span><span className="recent-menu"><MoreHorizontal size={16} /></span></button>)}
          <div className="rail-footnote">Chats are saved securely to your account.</div>
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
          <div className="workspace-title"><span>Agent Garden</span><span className="title-divider">/</span><span className="muted-title">{chatTitle}</span>{!config.authRequired && <span className="test-mode-badge">Temporary test mode</span>}</div>
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
                    {message.execution && <div className={`execution-transcript ${message.execution.status || "completed"}`}><div className="execution-transcript-header"><span className={`execution-status-dot ${message.execution.status || "completed"}`} /><strong>{message.execution.status === "awaiting_code" ? "Waiting for code" : "E2B sandbox transcript"}</strong><span className="execution-runtime">{message.execution.durationMs ? `${(message.execution.durationMs / 1000).toFixed(1)}s` : message.execution.status === "awaiting_code" ? "ready" : "completed"}</span></div>{message.execution.status !== "awaiting_code" && <div className="execution-command"><span>ubuntu@sandbox:~$</span><code>{message.execution.command || `${message.execution.language || "python"} script`}</code></div>}<div className="execution-phase-row"><span>{message.execution.status === "awaiting_code" ? "No process started" : "Provisioned → running → finalized"}</span>{message.execution.exitCode !== null && message.execution.exitCode !== undefined && <span className={message.execution.exitCode === 0 ? "execution-success" : "execution-failure"}>{message.execution.exitCode === 0 ? "Exited 0" : `Exited ${message.execution.exitCode}`}</span>}</div>{message.execution.status !== "awaiting_code" && <pre className="execution-output">{[message.execution.stdout && `STDOUT\n${message.execution.stdout.trim()}`, message.execution.stderr && `STDERR\n${message.execution.stderr.trim()}`].filter(Boolean).join("\n\n") || "(no output)"}</pre>}{message.execution.artifacts?.length > 0 && <div className="execution-artifacts"><strong>Files saved to Workspace</strong>{message.execution.artifacts.map((artifact) => <a key={artifact.key} href={artifact.url} target="_blank" rel="noreferrer"><FileText size={13} />{artifact.name}<span>{Math.max(1, Math.round(artifact.size / 1024))} KB · Download</span></a>)}</div>}</div>}
                    {message.files?.length > 0 && <div className="attached-list">{message.files.map((file) => <span key={file.name}><FileText size={14} />{file.name}</span>)}</div>}
                    {message.fallbackReason && <div className="fallback-note">{message.fallbackReason}</div>}
                    {message.researchNotice && <div className="fallback-note">{message.researchNotice}</div>}
                    {message.routingReason && <div className="routing-note"><Sparkles size={13} />{message.routingReason}</div>}
                    {message.sources?.length > 0 && <div className="sources"><span className="sources-heading"><Link2 size={14} />Sources</span>{message.sources.map((source, index) => <a key={source.uri} href={source.uri} target="_blank" rel="noreferrer"><span>[{index + 1}]</span>{source.title}</a>)}</div>}
                    {message.role === "assistant" && <div className="message-actions"><button onClick={() => saveMessageAsFile(message)}><Download size={13} />Save as file</button></div>}
                  </div>
                </article>
              ))}
              {sending && <>{chatExecutionLive?.active && <article className="message-row assistant"><div className="agent-avatar"><Route size={16} /></div><div className="live-terminal"><div className="live-terminal-header"><span className="execution-status-dot running" /><strong>{chatExecutionLive.phase === "provisioning" ? "Provisioning E2B sandbox" : chatExecutionLive.phase === "finalizing" ? "Collecting output and files" : "Running in E2B"}</strong><span>{chatExecutionLive.elapsed || 0}s</span></div><div className="live-terminal-body"><div className="live-terminal-line"><span>ubuntu@sandbox:~$</span> {chatExecutionLive.command || "preparing E2B command"}</div><div className="live-terminal-line muted">{chatExecutionLive.phase === "provisioning" ? "Connecting to isolated Ubuntu sandbox…" : chatExecutionLive.phase === "running" ? "Process is running; streaming terminal output…" : "Finalizing process and collecting generated files…"}</div>{(chatExecutionLive.stdout || chatExecutionLive.stderr) && <pre className="live-terminal-output">{[chatExecutionLive.stdout && `STDOUT\n${chatExecutionLive.stdout}`, chatExecutionLive.stderr && `STDERR\n${chatExecutionLive.stderr}`].filter(Boolean).join("\n\n")}</pre>}<span className="terminal-cursor" /></div></div></article>}<article className="message-row assistant"><div className="agent-avatar"><Sparkles size={16} /></div><div className="thinking"><LoaderCircle className="spin" size={17} />{active?.label || "Agent"} is working…</div></article></>}
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
                  <input ref={fileInputRef} className="hidden-input" type="file" multiple onChange={handleFiles} accept=".txt,.md,.pdf,.doc,.docx,.csv,.json,.xml,.js,.jsx,.mjs,.ts,.tsx,.py,.sh,.html,.css,.svg,.xls,.xlsx,.zip,.tar,.gz,image/*" />
                  <button className="tool-button" onClick={() => fileInputRef.current?.click()} disabled={!user || sending} title="Add files"><Paperclip size={18} /></button>
                  <button className="tool-button" onClick={() => setE2bOpen(true)} disabled={!user || sending} title="Run code in E2B"><Route size={18} /></button>
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

      {user?.email?.toLowerCase() === "luybenbrandon35@gmail.com" && <button className="admin-moderation-launcher" onClick={loadAdminData} disabled={adminLoading} title="Open admin moderation" aria-label="Open admin moderation"><ShieldCheck size={16} /><span>{adminLoading ? "Loading…" : "Moderation"}</span></button>}
      {suspended && user && <div className="auth-overlay"><div className="auth-card"><div className="auth-mark"><ShieldCheck size={23} /></div><span className="eyebrow">Account status</span><h2>Your account is suspended</h2><p>{suspensionReason}</p><p>You can submit an appeal for admin review. Your conversation and files remain inaccessible while the suspension is active.</p><button className="firebase-button" onClick={() => setAppealOpen(true)}>Submit an appeal</button></div></div>}
      {appealOpen && user && <div className="auth-overlay"><div className="auth-card"><span className="eyebrow">Appeal review</span><h2>Explain your appeal</h2><textarea rows={8} value={appealText} onChange={(event) => setAppealText(event.target.value)} placeholder="Tell the admin why the suspension should be reviewed." /><div className="onboarding-actions"><button className="secondary-auth-button" onClick={() => setAppealOpen(false)}>Cancel</button><button className="firebase-button" onClick={submitAppeal} disabled={appealBusy}>{appealBusy ? "Submitting…" : "Send appeal"}</button></div></div></div>}
      {adminOpen && user?.email?.toLowerCase() === "luybenbrandon35@gmail.com" && <div className="files-overlay"><section className="files-panel"><header className="files-panel-header"><div><span className="eyebrow">Trust and Safety</span><h2>Admin moderation</h2><p>Review account status, safety reports, and appeals.</p></div><button className="icon-button" onClick={() => setAdminOpen(false)}><X size={18} /></button></header><div className="admin-recovery-card"><div><strong>Admin account recovery</strong><small>Google sign-in remains available. You can also set a new email/password credential after signing in here.</small></div><button className="secondary-auth-button" onClick={() => setAdminPasswordOpen((open) => !open)}>{adminPasswordOpen ? "Cancel password reset" : "Set admin password"}</button>{adminPasswordOpen && <div className="admin-password-form"><label>New admin password<input type="password" minLength={12} autoComplete="new-password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} placeholder="At least 12 characters" /></label><label>Confirm password<input type="password" minLength={12} autoComplete="new-password" value={adminPasswordConfirm} onChange={(event) => setAdminPasswordConfirm(event.target.value)} placeholder="Repeat the password" /></label><button className="firebase-button" onClick={resetAdminPassword} disabled={adminPasswordBusy}>{adminPasswordBusy ? "Updating…" : "Update admin password"}</button></div>}</div><div className="files-list"><strong>Open appeals: {(adminData?.appeals || []).filter((item) => item.status === "open").length}</strong>{(adminData?.appeals || []).filter((item) => item.status === "open").map((appeal) => <article className="workspace-file" key={appeal.id}><div className="workspace-file-info"><strong>{appeal.user_id}</strong><small>{appeal.text}</small></div><div className="workspace-file-actions"><button onClick={() => decideAppeal(appeal, "approved")}>Approve</button><button onClick={() => decideAppeal(appeal, "denied")}>Deny</button></div></article>)}<strong>Recent safety reports: {(adminData?.reports || []).length}</strong>{(adminData?.reports || []).slice(0, 20).map((report) => <article className="workspace-file" key={report.id}><div className="workspace-file-info"><strong>{report.signal}</strong><small>User {report.user_id} · {report.confidence} · {new Date(report.created_at).toLocaleString()}</small></div></article>)}</div></section></div>}
      {config.authRequired && !user && <div className="auth-overlay"><div className="auth-card"><div className="auth-mark"><Sparkles size={23} /></div><span className="eyebrow">Secure workspace access</span><h2>{authMode === "signup" ? "Create your Agent Garden account" : "Welcome back to Agent Garden"}</h2><p>Sign in with email and password, or use Google when available. Your chats and personalization settings are stored securely in your account.</p><div className="auth-tabs"><button className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>Sign in</button><button className={authMode === "signup" ? "active" : ""} onClick={() => setAuthMode("signup")}>Create account</button></div><form className="account-form" onSubmit={submitAccount}>{authMode === "signup" && <label>Name<input value={accountForm.name} onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))} placeholder="Your name" autoComplete="name" /></label>}<label>Email<input type="email" required value={accountForm.email} onChange={(event) => setAccountForm((current) => ({ ...current, email: event.target.value }))} placeholder="you@example.com" autoComplete="email" /></label><label>Password<input type="password" required minLength={8} value={accountForm.password} onChange={(event) => setAccountForm((current) => ({ ...current, password: event.target.value }))} placeholder="At least 8 characters" autoComplete={authMode === "signup" ? "new-password" : "current-password"} /></label><button className="firebase-button" type="submit" disabled={accountBusy}>{accountBusy ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />}<span>{authMode === "signup" ? "Create account" : "Sign in with email"}</span></button></form>{config.firebaseConfig?.apiKey && <button className="secondary-auth-button" onClick={signInWithGoogle} disabled={signingIn}><Sparkles size={17} />{signingIn ? "Connecting…" : "Continue with Google"}</button>}{notice && <div className="notice error">{notice}</div>}<small>Do not use passwords or notes containing secrets. You control whether onboarding answers are used for AI personalization.</small></div></div>}
      {onboardingOpen && user && <div className="auth-overlay onboarding-overlay"><div className="onboarding-card"><div className="onboarding-header"><div><span className="eyebrow">Personalization setup</span><h2>Build your AI profile</h2><p>Answer at your own pace. You can change or delete this information later.</p></div><span className="onboarding-progress">{onboardingSection + 1} / {ONBOARDING_SECTIONS.length}</span></div><div className="onboarding-steps">{ONBOARDING_SECTIONS.map((section, index) => <button key={section.id} className={index === onboardingSection ? "active" : index < onboardingSection ? "complete" : ""} onClick={() => setOnboardingSection(index)}>{index + 1}. {section.title}</button>)}</div>{(() => { const section = ONBOARDING_SECTIONS[onboardingSection]; return <div className="onboarding-body"><h3>{section.title}</h3><p>{section.description}</p><div className="onboarding-questions">{section.questions.map((question) => { const key = `${section.id}.${question.key}`; return <label key={key}>{question.label}<textarea rows={2} value={onboardingAnswers[key] || ""} onChange={(event) => setOnboardingAnswers((current) => ({ ...current, [key]: event.target.value }))} placeholder={question.placeholder} /></label>; })}</div><label className="memory-toggle"><input type="checkbox" checked={Boolean(aiMemoryEnabled)} onChange={(event) => setAiMemoryEnabled(event.target.checked)} /><span><strong>Allow AI personalization</strong><small>Use included answers to make future agent responses more relevant.</small></span></label><label className="memory-toggle section-memory"><input type="checkbox" checked={Boolean(sectionMemory[section.id])} disabled={!aiMemoryEnabled} onChange={(event) => setSectionMemory((current) => ({ ...current, [section.id]: event.target.checked }))} /><span><strong>Include this section in AI memory</strong><small>This section stays saved to your profile, but can be excluded from prompts.</small></span></label><div className="onboarding-actions"><button className="secondary-auth-button" onClick={() => setOnboardingSection((current) => Math.max(0, current - 1))} disabled={onboardingSection === 0}>Back</button>{onboardingSection < ONBOARDING_SECTIONS.length - 1 ? <button className="firebase-button" onClick={() => setOnboardingSection((current) => current + 1)}>Continue</button> : <button className="firebase-button" onClick={saveOnboarding} disabled={accountBusy}>{accountBusy ? "Saving…" : "Save profile"}</button>}</div></div>; })()}</div></div>}
      {e2bOpen && user && <div className="auth-overlay"><div className="e2b-card"><div className="onboarding-header"><div><span className="eyebrow">E2B secure sandbox</span><h2>Run code safely</h2><p>Execute a short script in an isolated cloud environment and inspect the live execution state.</p></div><button className="icon-button" onClick={() => setE2bOpen(false)}><X size={18} /></button></div><div className="e2b-toolbar"><select value={e2bLanguage} onChange={(event) => setE2bLanguage(event.target.value)}><option value="python">Python</option><option value="javascript">JavaScript</option><option value="bash">Bash</option></select><button className="firebase-button" onClick={runInE2B} disabled={e2bBusy}>{e2bBusy ? <LoaderCircle className="spin" size={16} /> : <Route size={16} />} {e2bBusy ? "Running…" : "Run in E2B"}</button></div><div className="e2b-live-bar"><span className={`e2b-live-dot ${e2bPhase}`} /><strong>{e2bPhase === "idle" ? "Sandbox ready" : e2bPhase === "provisioning" ? "Provisioning sandbox" : e2bPhase === "running" ? "Code is running" : e2bPhase === "finalizing" ? "Collecting output" : e2bPhase === "complete" ? "Execution complete" : "Execution needs attention"}</strong><span className="e2b-network-badge">Internet-enabled E2B</span><span className="e2b-clock">{e2bElapsed}s</span></div><div className="e2b-preview-label">Live code preview · {e2bLanguage}</div><textarea className="e2b-editor" value={e2bCode} onChange={(event) => setE2bCode(event.target.value)} spellCheck="false" />{e2bBusy && <div className="e2b-stream"><span className="terminal-cursor" />E2B sandbox is active · streaming terminal output…</div>}{e2bOutput && <pre className="e2b-output">{e2bOutput}</pre>}</div></div>}
      {filesOpen && user && <div className="files-overlay"><section className="files-panel"><header className="files-panel-header"><div><span className="eyebrow">Workspace storage</span><h2>Files</h2><p>Uploaded attachments and responses you saved for download.</p></div><div className="files-panel-actions"><button className="icon-button" onClick={loadWorkspaceFiles} title="Refresh files"><RefreshCw className={filesLoading ? "spin" : ""} size={17} /></button><button className="icon-button" onClick={() => setFilesOpen(false)} title="Close files"><X size={18} /></button></div></header>{filesLoading && <div className="files-empty"><LoaderCircle className="spin" size={18} />Loading workspace files…</div>}{!filesLoading && workspaceFiles.length === 0 && <div className="files-empty"><Files size={28} /><strong>No workspace files yet</strong><span>Upload an attachment or save an assistant response to see it here.</span></div>}{!filesLoading && workspaceFiles.length > 0 && <div className="files-list">{workspaceFiles.map((file) => <article className="workspace-file" key={file.key}><div className="workspace-file-icon"><FileText size={18} /></div><div className="workspace-file-info"><strong>{file.name}</strong><small>{file.size ? `${Math.max(1, Math.round(file.size / 1024))} KB` : "Empty"} · {file.lastModified ? new Date(file.lastModified).toLocaleDateString() : "Workspace file"}</small></div><div className="workspace-file-actions"><a href={file.url} target="_blank" rel="noreferrer" title="Download file"><Download size={16} /></a><button onClick={() => deleteWorkspaceFile(file)} title="Delete file"><Trash2 size={16} /></button></div></article>)}</div>}</section></div>}
      {notice && user && <div className="notice toast error"><button onClick={() => setNotice("")}><X size={14} /></button>{notice}</div>}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
