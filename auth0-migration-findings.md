# Auth0 migration findings

Auth0’s official Express quickstart recommends the `express-openid-connect` middleware for a Regular Web Application. It supplies hosted login, callback, logout, and encrypted cookie-session handling. The documented environment contract is `ISSUER_BASE_URL`, `CLIENT_ID`, `SECRET`, and `BASE_URL`, with allowed callback and logout URLs configured in the Auth0 application settings.

The authorization-code flow requires a registered callback URL and exchanges the authorization code for tokens server-side. Agent Garden uses `https://agent-garden-chat.onrender.com/callback` as the production callback and `https://agent-garden-chat.onrender.com` as the base/logout URL. Auth0 identities are mapped to the existing D1 user model by using the Auth0 `sub` as the user ID, preserving the current admin email check and all D1 chat, safety, suspension, appeal, E2B, and storage ownership logic.

The code is feature-gated: Auth0 activates only when `AUTH0_ISSUER_BASE_URL`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, and `AUTH0_SECRET` are present. Until those values are supplied, Firebase remains the fallback provider. The frontend switches its Google button to `/login` when the API reports `authMode: "auth0"` and skips Firebase initialization in that mode.

Sources:
- https://auth0.com/docs/quickstart/webapp/express
- https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow/add-login-auth-code-flow
- https://github.com/auth0/express-openid-connect
