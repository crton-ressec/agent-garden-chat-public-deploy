import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

const requiredEnv = [
  "FIREBASE_API_KEY",
  "FIREBASE_AUTH_DOMAIN",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_STORAGE_BUCKET",
  "FIREBASE_MESSAGING_SENDER_ID",
  "FIREBASE_APP_ID",
  "GEMINI_API_KEY",
  "SESSION_SECRET",
];
let firebaseCertCache = { expiresAt: 0, certs: {} };
const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const requestWindows = new Map();
const REQUEST_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 8;

const AGENTS = {
  coordinator: {
    label: "Coordinator",
    icon: "Sparkles",
    description: "Breaks a request into the smallest useful specialist steps.",
    provider: "Gemini",
    prompt: "You are the coordinator of a careful multi-agent workspace. Decide the most useful next action and give the user a direct, structured answer. If a task needs research, coding, or file analysis, state what that specialist would focus on. Do not pretend you executed tools you did not execute.",
  },
  researcher: {
    label: "Researcher",
    icon: "Compass",
    description: "Synthesizes web-grounded findings and highlights uncertainty.",
    provider: "Gemini",
    prompt: "You are a research specialist. Prioritize current, factual, well-qualified answers. Distinguish observed facts from inferences. When grounding sources are supplied, cite them as [1], [2] in the response and add a short Sources section.",
    search: true,
  },
  fileAnalyst: {
    label: "File Analyst",
    icon: "Files",
    description: "Reads attached text, code, or images and extracts what matters.",
    provider: "Gemini",
    prompt: "You are a meticulous file analyst. Analyze the supplied attachments first, then answer. State file-level observations clearly. If an attachment is incomplete or unreadable, say so rather than guessing.",
  },
  coder: {
    label: "Coder",
    icon: "Code2",
    description: "Designs, writes, and explains practical code changes.",
    provider: "Gemini",
    prompt: "You are a senior software engineer. Give secure, runnable, minimal solutions. Explain assumptions, include only necessary code, and call out commands, files, and testing steps. Never claim you ran code unless results are included in the prompt.",
  },
  debugger: {
    label: "Debugger",
    icon: "Bug",
    description: "Narrows faults from evidence and proposes safe fixes.",
    provider: "Gemini",
    prompt: "You are a debugging specialist. Work from observed symptoms and evidence. Provide ranked hypotheses, the quickest discriminating checks, and a minimal fix. Avoid speculative certainty.",
  },
  planner: {
    label: "Planner",
    icon: "Route",
    description: "Turns an outcome into a sequenced, checkable plan.",
    provider: "Gemini",
    prompt: "You are a pragmatic project planner. Convert the request into a short sequence of concrete milestones, identify dependencies and risks, and propose a sensible first step. Optimize for implementation rather than theory.",
  },
  writer: {
    label: "Writer",
    icon: "PenLine",
    description: "Creates polished copy with the intended voice and audience.",
    provider: "Gemini",
    prompt: "You are a precise, adaptable writer. Deliver polished copy matched to the user’s stated audience and format. Ask one focused question only if essential details are missing; otherwise make reasonable, stated assumptions.",
  },
  critic: {
    label: "Critic",
    icon: "ShieldCheck",
    description: "Stress-tests assumptions, quality, and safety concerns.",
    provider: "Gemini",
    prompt: "You are a constructive critic. Identify gaps, ambiguity, risks, and improvements in the user’s proposal or draft. Be specific and practical, and include a prioritized improvement list rather than vague criticism.",
  },
  synthesizer: {
    label: "Synthesizer",
    icon: "Layers3",
    description: "Combines context into one clear final answer.",
    provider: "Gemini",
    prompt: "You are a synthesis specialist. Combine the supplied context into a coherent, concise answer with an executive summary, the key details, and clear next actions. Preserve important uncertainty and disagreements.",
  },
};

const AUTO_AGENT = {
  id: "auto",
  label: "Auto route",
  icon: "Route",
  description: "Selects the most useful specialist before one model call is made.",
  provider: "Smart route",
};

function routeRequest(message, files) {
  if (Array.isArray(files) && files.length) {
    return { id: "fileAnalyst", reason: "An attachment was supplied, so File Analyst was selected." };
  }
  const text = String(message || "").toLowerCase();
  if (/\b(error|bug|stack trace|exception|not working|crash|failed|failure)\b/.test(text)) {
    return { id: "debugger", reason: "The request contains a troubleshooting signal, so Debugger was selected." };
  }
  if (/\b(code|function|component|api|endpoint|typescript|javascript|python|sql|html|css|react|implement|build a)\b/.test(text)) {
    return { id: "coder", reason: "The request concerns implementation, so Coder was selected." };
  }
  if (/\b(latest|current|today|news|research|find out|compare|sources|search the web|market|recent)\b/.test(text)) {
    return { id: "researcher", reason: "The request appears time-sensitive or evidence-seeking, so Researcher was selected." };
  }
  if (/\b(plan|roadmap|milestone|steps|strategy|schedule|timeline)\b/.test(text)) {
    return { id: "planner", reason: "The request asks for sequencing or strategy, so Planner was selected." };
  }
  if (/\b(rewrite|write|draft|email|article|post|copy|caption|tone)\b/.test(text)) {
    return { id: "writer", reason: "The request is primarily writing-focused, so Writer was selected." };
  }
  if (/\b(review|critique|risk|improve|weakness|audit|evaluate)\b/.test(text)) {
    return { id: "critic", reason: "The request asks for assessment, so Critic was selected." };
  }
  if (/\b(summarize|synthesi[sz]e|combine|distill|recap)\b/.test(text)) {
    return { id: "synthesizer", reason: "The request asks to combine context, so Synthesizer was selected." };
  }
  return { id: "coordinator", reason: "Coordinator was selected to clarify and structure the next best step." };
}

function resolveAgent(requestedId, message, files) {
  if (requestedId === "auto" || !AGENTS[requestedId]) {
    const route = routeRequest(message, files);
    return { agent: { id: route.id, ...AGENTS[route.id] }, routingReason: route.reason };
  }
  return { agent: { id: requestedId, ...AGENTS[requestedId] }, routingReason: "Selected manually by the user." };
}

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: "14mb" }));
app.use(cookieParser());

function configured() {
  return requiredEnv.every((name) => Boolean(process.env[name]));
}

async function getFirebaseCertificates(forceRefresh = false) {
  if (!forceRefresh && firebaseCertCache.expiresAt > Date.now() && Object.keys(firebaseCertCache.certs).length) {
    return firebaseCertCache.certs;
  }
  const response = await fetch("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com");
  if (!response.ok) throw new Error("Firebase public signing certificates are unavailable.");
  const certs = await response.json();
  const cacheControl = response.headers.get("cache-control") || "";
  const maxAge = Number(cacheControl.match(/max-age=(\\d+)/)?.[1] || 3600);
  firebaseCertCache = { certs, expiresAt: Date.now() + Math.max(300, maxAge - 60) * 1000 };
  return certs;
}

async function verifyFirebaseIdToken(idToken) {
  const header = jwt.decode(idToken, { complete: true })?.header;
  if (!header?.kid || header.alg !== "RS256") throw new Error("Invalid Firebase ID token header.");
  let certs = await getFirebaseCertificates();
  let certificate = certs[header.kid];
  if (!certificate) {
    certs = await getFirebaseCertificates(true);
    certificate = certs[header.kid];
  }
  if (!certificate) throw new Error("Firebase ID token signing key is not recognized.");
  return jwt.verify(idToken, certificate, {
    algorithms: ["RS256"],
    issuer: `https://securetoken.google.com/${process.env.FIREBASE_PROJECT_ID}`,
    audience: process.env.FIREBASE_PROJECT_ID,
  });
}

function userFromRequest(req) {
  const token = req.cookies.agent_garden_session;
  if (!token || !process.env.SESSION_SECRET) return null;
  try {
    return jwt.verify(token, process.env.SESSION_SECRET);
  } catch {
    return null;
  }
}

function requireUser(req, res, next) {
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ error: "Please sign in with Google to continue." });
  req.user = user;
  next();
}

function userRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.user.sub;
  const windowStart = now - REQUEST_WINDOW_MS;
  const recent = (requestWindows.get(key) || []).filter((timestamp) => timestamp > windowStart);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: "You have reached the temporary request limit. Please wait a minute and try again." });
  }
  recent.push(now);
  requestWindows.set(key, recent);
  next();
}

function compactHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-12)
    .filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string")
    .map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.content.slice(0, 6000) }],
    }));
}

function fileParts(files) {
  if (!Array.isArray(files)) return [];
  return files
    .slice(0, 5)
    .filter((file) => file && typeof file.data === "string" && typeof file.mimeType === "string")
    .map((file) => ({
      inlineData: {
        mimeType: file.mimeType,
        data: file.data.replace(/^data:[^;]+;base64,/, ""),
      },
    }));
}

function citationsFrom(response) {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  return chunks
    .map((chunk) => chunk?.web)
    .filter((web) => web?.uri && web?.title)
    .slice(0, 6)
    .map((web) => ({ title: web.title, uri: web.uri }));
}

async function callGemini({ agent, message, history, files }) {
  if (!gemini) throw new Error("Gemini is not configured on the server.");
  const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  const contents = [
    ...compactHistory(history),
    { role: "user", parts: [{ text: message }, ...fileParts(files)] },
  ];
  const config = {
    systemInstruction: agent.prompt,
    temperature: agent.id === "coder" ? 0.2 : 0.65,
    maxOutputTokens: 4000,
  };
  let response;
  let researchNotice = "";
  try {
    response = await gemini.models.generateContent({
      model,
      contents,
      config: agent.search ? { ...config, tools: [{ googleSearch: {} }] } : config,
    });
  } catch (groundingError) {
    if (!agent.search) throw groundingError;
    response = await gemini.models.generateContent({ model, contents, config });
    researchNotice = "Google Search grounding was unavailable for this reply, so the answer was generated without live web sources.";
  }
  const answer = response.text?.trim();
  if (!answer) throw new Error("Gemini returned an empty response.");
  return { answer, provider: "Gemini", sources: citationsFrom(response), researchNotice };
}

async function callPollinations({ agent, message, history, files }) {
  if (Array.isArray(files) && files.length) {
    throw new Error("Pollinations fallback cannot analyze attachments. Please retry when Gemini is available.");
  }
  const prior = compactHistory(history).map((entry) => ({
    role: entry.role === "model" ? "assistant" : "user",
    content: entry.parts[0].text,
  }));
  const response = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai-fast",
      messages: [
        { role: "system", content: agent.prompt + " Be concise because this is a fallback provider." },
        ...prior,
        { role: "user", content: message },
      ],
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (response.status === 402 || response.status === 429) {
    throw new Error("Pollinations' anonymous queue is currently full. Wait briefly and retry, or switch back to Gemini.");
  }
  if (!response.ok) throw new Error(`Pollinations fallback returned ${response.status}.`);
  const body = await response.json();
  const answer = body?.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("Pollinations returned an empty response.");
  return { answer, provider: "Pollinations", sources: [] };
}

app.get("/api/config", (_req, res) => {
  res.json({
    firebaseConfig: {
      apiKey: process.env.FIREBASE_API_KEY || "",
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
      projectId: process.env.FIREBASE_PROJECT_ID || "",
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
      appId: process.env.FIREBASE_APP_ID || "",
    },
    configured: configured(),
    agents: [
      AUTO_AGENT,
      ...Object.entries(AGENTS).map(([id, agent]) => ({
        id,
        label: agent.label,
        icon: agent.icon,
        description: agent.description,
        provider: agent.provider,
      })),
    ],
  });
});

app.post("/api/auth/firebase", async (req, res) => {
  if (!configured()) {
    return res.status(503).json({ error: "Firebase Authentication or Gemini is not configured on this server." });
  }
  const idToken = req.body?.idToken;
  if (!idToken) return res.status(400).json({ error: "Missing Firebase ID token." });
  try {
    const decoded = await verifyFirebaseIdToken(idToken);
    if (!decoded?.uid || !decoded.email) throw new Error("Firebase account identity could not be verified.");
    const user = {
      sub: decoded.uid,
      email: decoded.email,
      name: decoded.name || decoded.email.split("@")[0],
      picture: decoded.picture || "",
    };
    const token = jwt.sign(user, process.env.SESSION_SECRET, { expiresIn: "7d" });
    res.cookie("agent_garden_session", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });
    res.json({ user });
  } catch (error) {
    res.status(401).json({ error: error.message || "Firebase Sign-In verification failed." });
  }
});

app.get("/api/auth/me", (req, res) => {
  res.json({ user: userFromRequest(req) });
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("agent_garden_session", { path: "/" });
  res.status(204).end();
});

app.post("/api/chat", requireUser, userRateLimit, async (req, res) => {
  const message = String(req.body?.message || "").trim();
  const requestedAgentId = typeof req.body?.agentId === "string" ? req.body.agentId : "auto";
  const requestedProvider = req.body?.provider === "pollinations" ? "pollinations" : "gemini";
  const files = Array.isArray(req.body?.files) ? req.body.files : [];
  const { agent, routingReason } = resolveAgent(requestedAgentId, message, files);
  if (!message && !files.length) return res.status(400).json({ error: "Write a message or attach a file first." });
  if (message.length > 12000) return res.status(400).json({ error: "Please keep messages under 12,000 characters." });

  try {
    let result;
    if (requestedProvider === "pollinations") {
      result = await callPollinations({ agent, message, history: req.body?.history, files });
    } else {
      try {
        result = await callGemini({ agent, message, history: req.body?.history, files });
      } catch (geminiError) {
        if (files.length) throw geminiError;
        result = await callPollinations({ agent, message, history: req.body?.history, files });
        result.fallbackReason = "Gemini was unavailable, so this reply came from the lightweight fallback.";
      }
    }
    res.json({ ...result, agent: agent.id, routingReason });
  } catch (error) {
    res.status(502).json({ error: error.message || "The selected provider could not complete the request." });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", configured: configured(), timestamp: new Date().toISOString() });
});

app.use(express.static(path.join(__dirname, "dist"), { index: false, maxAge: isProduction ? "1h" : 0 }));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));

app.listen(port, () => {
  console.log(`Agent Garden is listening on port ${port}`);
});
