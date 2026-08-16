# Agent Garden

**Agent Garden** is a Render-ready, multi-agent chat workspace with an original, Gemini-inspired interface. It uses **Firebase Authentication with Google provider** for sign-up and sign-in, verifies Firebase ID tokens against Firebase’s public signing certificates, routes each task to one specialist automatically or manually, sends primary work to Gemini, and offers Pollinations as a text-only fallback.

> This is an independently built interface. It does not use Google branding or assets, and it is not presented as a Google product.

## What is included

| Area | Included behavior |
|---|---|
| Interface | A dark three-panel workspace with conversation history, a chat canvas, an attachment composer, an agent desk, source cards, and responsive mobile behavior. |
| Sign-up and sign-in | Firebase Authentication with Google provider, redirect-based sign-in, server-side Firebase ID-token verification using public signing certificates, and an HTTP-only signed application session cookie. |
| Agents | Auto route, Coordinator, Researcher, File Analyst, Coder, Debugger, Planner, Writer, Critic, and Synthesizer. |
| Routing | Auto route chooses one agent from the message content or attachment presence; it does not call all agents for every message. |
| Gemini | Primary provider for chat, file-aware analysis, coding, and research. The tested default is `gemini-3.1-flash-lite`. |
| Web research | Researcher requests Gemini Google Search grounding when it is available. If grounding cannot run, it retries without live sources and clearly labels the limitation. |
| Pollinations | Optional, lightweight, text-only fallback. Anonymous requests may be IP-throttled or queued. |
| Data storage | Conversations stay in the current browser session; no database is required. |
| Protection | A small per-user in-memory request limiter protects the shared Gemini key from rapid abuse. |

## Provider behavior and free-tier limits

Gemini’s free tier is quota-limited. Google Search grounding is available only within Google’s applicable free-tier allowance for supported models, and it can become unavailable after quota exhaustion. Pollinations’ anonymous endpoint is also not guaranteed: it can return queue/full or rate-limit responses. The app handles both conditions with an actionable message instead of silently fabricating a response.

| Provider | Primary use | Key required | Important limitation |
|---|---|---:|---|
| Gemini API | Main answers, files, coding, research | Yes | Free quotas and availability limits apply. |
| Pollinations legacy text | Text-only fallback | No | Anonymous IP queue may be full; no attachments or dependable live research. |
| Firebase Authentication | Google sign-up and sign-in | Firebase project required | Firebase Authentication and Google provider must be enabled in the Firebase Console. |

## Run locally

Use Node.js 22 or newer.

```bash
npm install
cp .env.example .env
# Populate the Firebase, Gemini, and session values in .env, then:
npm run build
npm start
```

For local browser development, you can instead run:

```bash
npm run dev
```

When using the Vite development server, run the API server separately on port `3000`, or build the app and use `npm start` for the fully integrated experience.

## Required environment variables

### Gemini and application session

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Private server-side Gemini API key from Google AI Studio. |
| `GEMINI_MODEL` | Optional override; defaults to `gemini-3.1-flash-lite`. |
| `SESSION_SECRET` | A long random secret used to sign the application session cookie. |
| `NODE_ENV` | Set to `production` on Render. |

### Firebase web configuration

These values come from **Firebase Console → Project settings → Your apps → Web app configuration**. They are used by the browser Firebase SDK. The server also uses `FIREBASE_PROJECT_ID` to validate Firebase token issuer and audience claims.

| Variable | Firebase web configuration field |
|---|---|
| `FIREBASE_API_KEY` | `apiKey` |
| `FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `FIREBASE_PROJECT_ID` | `projectId` |
| `FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `FIREBASE_APP_ID` | `appId` |

Never add `.env` or private credentials to GitHub. The included `.gitignore` excludes `.env`.

## Configure Firebase Google sign-up

1. Open the [Firebase Console](https://console.firebase.google.com/) and create or select a Firebase project.
2. Go to **Authentication → Sign-in method** and enable the **Google** provider.
3. Go to **Project settings → Your apps**, add a **Web app**, and copy its Firebase configuration into the six `FIREBASE_*` web variables.
4. Go to **Authentication → Settings → Authorized domains** and add your production host, for example:

   ```text
   agent-garden-chat.onrender.com
   ```

   Keep `localhost` authorized for local development.

5. Add your Gemini key and a random `SESSION_SECRET`.

No separate Google OAuth client ID, Google client secret, or Firebase service-account JSON is needed for this flow. Firebase manages the Google provider configuration, while the Node.js backend verifies Firebase ID tokens with Firebase’s rotating public signing certificates.

## Deploy to Render

The repository includes `render.yaml` for a free Node.js web service.

1. Put this project in a private GitHub repository. Do not commit `.env` or private credentials.
2. In Render, select **New → Blueprint** and connect the repository. Render reads `render.yaml`.
3. Confirm the Free web-service plan and add the Gemini key, the six Firebase web values, and `SESSION_SECRET`.
4. Deploy. Render builds with `npm ci --include=dev && npm run build` and starts the service with `npm start`.
5. Add the final Render hostname to Firebase Authentication’s **Authorized domains**, then open the deployed app and click **Continue with Google**. The app redirects to Google for authentication and returns to Agent Garden to finish the session exchange.

Render free web services are appropriate for demos and personal projects but can have usage limits and cold-start behavior. Keep the app’s rate limit in place and do not promise unlimited use.

## Optional Docker deployment

A reviewed `Dockerfile` is included for portability. Render does not need it for this project, but you can build it locally:

```bash
docker build -t agent-garden .
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e GEMINI_API_KEY \
  -e GEMINI_MODEL \
  -e FIREBASE_API_KEY \
  -e FIREBASE_AUTH_DOMAIN \
  -e FIREBASE_PROJECT_ID \
  -e FIREBASE_STORAGE_BUCKET \
  -e FIREBASE_MESSAGING_SENDER_ID \
  -e FIREBASE_APP_ID \
  -e SESSION_SECRET \
  agent-garden
```

## Checks completed

The Firebase-authenticated project builds successfully with Vite, passes `node --check server.mjs`, and has no production dependency vulnerabilities after the UUID compatibility override. The local service health and Firebase web configuration endpoints were verified with placeholder values. The live sign-up flow must be completed after you add the real Firebase web configuration values and session secret in Render.

## Temporary authentication test mode

For temporary chat testing only, set the Render environment variable `AUTH_REQUIRED=false`. This exposes the app without Google authentication and uses a clearly labeled temporary test user. Restore `AUTH_REQUIRED=true` before any real deployment or personal data storage.

## References

- [Firebase: Authenticate Using Google with JavaScript](https://firebase.google.com/docs/auth/web/google-signin)
- [Firebase: Verify ID Tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Render free instances](https://render.com/docs/free)
- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Pollinations API documentation](https://gen.pollinations.ai/docs)
