<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Repo rules

**Every `'use server'` export must validate its arguments at runtime before
they reach Prisma.** A server action's parameters are wire input — deserialized
from a request body — and its TypeScript types guarantee nothing about what
actually arrives. Build the object you pass to Prisma field by field from an
allow-list (never spread a caller-supplied patch into `update`/`create`: an
unchecked `userId` in it selects another tenant's row), check value types, and
return a 400-shaped result for bad input instead of throwing. C1 (cross-tenant
write through `saveConfigFor`'s patch) and I5 (`sampleValues` throwing on an
unknown key) were the same lesson twice.
