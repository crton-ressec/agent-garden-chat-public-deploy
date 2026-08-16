# Agent Garden

**Agent Garden** is a Render-ready, multi-agent chat workspace with an original, Gemini-inspired interface. It uses Google Sign-In to gate access, routes each task to one specialist automatically or manually, sends primary work to Gemini, and offers Pollinations as a text-only fallback.

> This is an independently built interface. It does not use Google branding or assets, and it is not presented as a Google product.

## What is included

| Area | Included behavior |
|---|---|
| Interface | A dark three-panel workspace with conversation history, a chat canvas, an attachment composer, an agent desk, source cards, and responsive mobile behavior. |
| Sign-in | Google Identity Services button, server-side ID-token verification, and an HTTP-only signed session cookie. |
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

## Run locally

Use Node.js 22 or newer.

```bash
npm install
cp .env.example .env
# Populate the three required values in .env, then:
npm run build
npm start
```

For local browser development, you can instead run:

```bash
npm run dev
```

When using the Vite development server, run the API server separately on port `3000`, or build the app and use `npm start` for the fully integrated experience.

## Required environment variables

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Private server-side Gemini API key from Google AI Studio. |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth 2.0 **Web application** client ID used by Sign in with Google. |
| `SESSION_SECRET` | A long random secret used to sign the application session cookie. |
| `GEMINI_MODEL` | Optional override; defaults to `gemini-3.1-flash-lite`. |
| `NODE_ENV` | Set to `production` on Render. |

Never add `.env` to Git or paste keys into chat messages. The included `.gitignore` excludes it.

## Configure Google Sign-In

The app uses **Google Identity Services for authentication only**. It does not request Gmail, Drive, or other Google data scopes.

1. In [Google Cloud](https://console.cloud.google.com/), create or select a project.
2. Configure the OAuth consent-screen branding for an external app, then create an OAuth client of type **Web application**.
3. Copy its Client ID into `GOOGLE_CLIENT_ID`.
4. Under **Authorized JavaScript origins**, add the exact origins you will use:

   ```text
   http://localhost:3000
   https://YOUR-RENDER-SERVICE.onrender.com
   ```

5. Add the same Google client ID as a private Render environment variable. A client secret is **not** needed for this identity-only Sign in with Google flow.

Google requires the production origin to match the origin registered for the client. Add the Render URL after the first deployment, then redeploy or refresh the site.

## Deploy to Render

The repository includes `render.yaml` for a free Node.js web service.

1. Put this project in a private GitHub repository. Do not commit `.env`.
2. In Render, select **New → Blueprint** and connect the repository. Render reads `render.yaml`.
3. Confirm the Free web-service plan and add the prompted private variables:

   ```text
   GEMINI_API_KEY=your Google AI Studio key
   GOOGLE_CLIENT_ID=your Google OAuth Web client ID
   SESSION_SECRET=a long random secret
   ```

4. Deploy. Render builds with `npm ci && npm run build` and starts the service with `npm start`.
5. Copy the final `https://...onrender.com` URL into Google Cloud’s **Authorized JavaScript origins**, then return to the app and test Sign in with Google.

Render free web services are appropriate for demos and personal projects but can have usage limits and cold-start behavior. Keep the app’s rate limit in place and do not promise unlimited use.

## Optional Docker deployment

A reviewed `Dockerfile` is included for portability. Render does not need it for this project, but you can build it locally:

```bash
docker build -t agent-garden .
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e GEMINI_API_KEY \
  -e GOOGLE_CLIENT_ID \
  -e SESSION_SECRET \
  agent-garden
```

## Checks completed

The project has been built successfully with Vite and audited with `npm audit --omit=dev`, which reported no production dependency vulnerabilities at the time of completion. A direct Gemini `gemini-3.1-flash-lite` smoke test completed successfully. An authenticated end-to-end request using **Auto route** correctly selected the **Coder** agent and returned a Gemini response with routing metadata. The local interface was visually reviewed, including its Google Sign-In gate, agent desk, attachment controls, provider selector, and responsive layout.

The anonymous Pollinations endpoint returned its expected queue-full response during validation; the application translates this into a clear retry-or-switch-to-Gemini message. The final Google Sign-In flow requires your actual OAuth client ID and matching approved origin, so that one live sign-in step must be completed after deployment.

## References

- [Google Sign in with Google for Web](https://developers.google.com/identity/gsi/web/guides/overview)
- [Google OAuth 2.0 for web-server applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Render free instances](https://render.com/docs/free)
- [Pollinations API documentation](https://gen.pollinations.ai/docs)
