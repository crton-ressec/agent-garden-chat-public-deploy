# Firebase redirect authentication findings

Firebase’s official redirect best-practices documentation says that non-Firebase-hosted applications can be affected by browsers blocking third-party storage used by the Firebase auth helper iframe. For apps hosted outside Firebase Hosting, the documented options include switching to popup sign-in, proxying `/__/auth/` requests through the application domain to `<project>.firebaseapp.com`, self-hosting the helper files, or handling provider sign-in independently and exchanging credentials with `signInWithCredential`.

Agent Garden is hosted on Render and the observed failure is an empty `getRedirectResult()` plus no `auth.currentUser` after returning from Google. The selected correction is Firebase’s documented proxy approach: forward `/__/auth/*` and `/__/firebase/init.json` through the Render server to `https://agentic-garden.firebaseapp.com`, and return the Render app origin as the Firebase client `authDomain`. This makes the browser-facing auth helper same-origin with Agent Garden and avoids the cross-origin storage handoff.

The Firebase documentation also requires the deployed origin to be an authorized domain and the same-origin helper URI to be authorized by the provider. The expected helper URI is `https://agent-garden-chat.onrender.com/__/auth/handler`. The Firebase console and Google OAuth configuration must therefore include the Render origin and helper URI before production verification.

Sources:
- https://firebase.google.com/docs/auth/web/redirect-best-practices
- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/auth/web/start
