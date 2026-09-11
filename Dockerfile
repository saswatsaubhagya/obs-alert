FROM node:22-alpine AS build
WORKDIR /app
# Prisma's engines link against OpenSSL, which the alpine base does not carry.
RUN apk add --no-cache openssl
COPY package*.json ./
# @node-rs/argon2 ships prebuilt native binaries as optional deps
# (e.g. @node-rs/argon2-linux-x64-gnu) — npm resolves the right one for
# this image's platform/libc during install, no compiler needed.
RUN npm ci
COPY . .
# `prisma generate`/`next build` only read the schema and never connect to a
# database, but prisma.config.ts's `env("DATABASE_URL")` throws if the var is
# entirely unset while resolving config. This placeholder satisfies that
# check at build time only — it is a build-stage ENV, so it is not present
# in the final image; the real DATABASE_URL is supplied at `docker run`.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate && npm run build

# Prune before the COPY, not after it: deleting a file in the runtime stage
# leaves it in the layer it was copied in, and the image does not get smaller.
#
# Prisma ships every engine for every database it supports. This app is
# Postgres-only and runs exactly two Prisma operations: `migrate deploy`
# (schema-engine) and client queries (the libquery engine under .prisma/client).
#   - the libquery engine is shipped three times, byte-identical; .prisma/client
#     holds the copy the generated client resolves, the other two serve CLI
#     commands this image never runs (introspect / db pull / studio)
#   - the mysql/sqlite/sqlserver/cockroachdb wasm runtimes are dead weight here
# Safe only while this stays Postgres-only and boot-time migrate is the only CLI
# command it runs — revisit if either changes.
RUN rm -f node_modules/@prisma/engines/libquery_engine-* \
          node_modules/prisma/libquery_engine-* && \
    find node_modules -type f \( \
        -name "*_bg.mysql.*" -o -name "*_bg.sqlite.*" -o \
        -name "*_bg.sqlserver.*" -o -name "*_bg.cockroachdb.*" \) -delete

# sharp is Next's image optimiser, traced in whether or not it is used. Nothing
# in src/ imports next/image, so the optimiser never runs. Drop this RUN if a
# next/image is ever added.
RUN rm -rf .next/standalone/node_modules/@img .next/standalone/node_modules/sharp

# A standalone install of just the Prisma CLI, for the boot-time migration.
# Cherry-picking package directories out of /app/node_modules instead looks
# cheaper but is not: the CLI pulls @prisma/config -> effect and further
# transitive deps, and copying them one by one breaks on any version bump.
# Pinned to the version resolved above so the CLI and the generated client
# cannot drift apart.
RUN mkdir /cli && cd /cli && npm init -y >/dev/null && \
    npm install --no-audit --no-fund \
        prisma@$(node -p "require('/app/node_modules/prisma/package.json').version") && \
    rm -f node_modules/@prisma/engines/libquery_engine-* \
          node_modules/prisma/libquery_engine-* && \
    find node_modules -type f \( \
        -name "*_bg.mysql.*" -o -name "*_bg.sqlite.*" -o \
        -name "*_bg.sqlserver.*" -o -name "*_bg.cockroachdb.*" \) -delete

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl
# NODE_ENV=production is what flips Auth.js's trustHost default to false, which
# is why src/auth.ts sets `trustHost: true`. Do not "fix" a login failure here
# by unsetting this; AUTH_TRUST_HOST/AUTH_URL are not needed either.
ENV NODE_ENV=production

# `output: 'standalone'` (next.config.ts) traces the server's real imports into
# .next/standalone, including its own minimal node_modules. Everything the build
# stage needed and the server does not — typescript, eslint, the bundler
# toolchain — stays behind in that stage.
COPY --from=build /app/.next/standalone ./
# Tracing covers code, not assets: these two are copied verbatim by design.
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# The schema and migration history, for the boot-time `migrate deploy`.
COPY --from=build /app/prisma ./prisma
# The CLI lives in its own tree rather than being merged into ./node_modules:
# the traced bundle ships its own @prisma/client with the generated engine, and
# a merge would overwrite it with the CLI's ungenerated copy.
COPY --from=build /cli/node_modules ./.migrate/node_modules

EXPOSE 3000
# server.js is standalone's entrypoint; `npm start`/`next start` are not present
# here because the Next CLI is not traced into the bundle.
# The CLI is invoked by its entry file rather than `npx prisma`: npm's
# node_modules/.bin symlinks are not copied in, so the command name does not
# resolve. No prisma.config.ts is shipped either — without one the CLI falls
# back to prisma/schema.prisma and prisma/migrations, which is what that config
# pointed at anyway, and not shipping it avoids dragging in its dotenv import.
CMD ["sh", "-c", "node .migrate/node_modules/prisma/build/index.js migrate deploy && node server.js"]
