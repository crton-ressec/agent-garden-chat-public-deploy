# E2B and Cloudflare R2 integration findings

## E2B
E2B's official JavaScript quickstart uses the `e2b` package and `Sandbox.create()`, authenticated by `E2B_API_KEY`. The sandbox exposes `commands.run()` for shell commands and `files.read()` / `files.write()` for file transfer. The Code Interpreter package `@e2b/code-interpreter` supports JavaScript and TypeScript execution through `runCode()` with language values such as `js` or `ts`. E2B sandboxes are isolated Linux environments intended for agent code execution and tool use.

## Cloudflare R2
Cloudflare R2 exposes an S3-compatible endpoint at `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` with region `auto`. The official Node.js approach uses `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`, with R2 access key ID and secret kept server-side. Presigned URLs can grant scoped PUT, GET, HEAD, or DELETE access for 1 second to 7 days; browser uploads require a matching R2 CORS policy and, when content type is included in the signature, the upload must send the exact same `Content-Type`. Presigned URLs are bearer tokens and should have short expirations for private files. R2 does not support HTML POST multipart presigned forms, so the implementation should use PUT URLs or server-proxied uploads.

## Recommended Agent Garden shape
The Render backend should issue short-lived, user-scoped R2 presigned PUT URLs, validate filename, MIME type, and size before signing, and return an object key. The frontend should upload directly with `PUT`, then send object metadata to chat. E2B should be invoked only from authenticated backend routes, with user-owned sandboxes and strict execution time/output limits. E2B API keys and R2 credentials must remain Render secrets.

## Sources
- https://e2b.dev/docs
- https://e2b.dev/docs/code-interpreting/supported-languages/javascript
- https://e2b.dev/docs/filesystem/read-write
- https://e2b.dev/docs/api-key
- https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
- https://developers.cloudflare.com/r2/buckets/cors/
- https://developers.cloudflare.com/r2/api/s3/api/
