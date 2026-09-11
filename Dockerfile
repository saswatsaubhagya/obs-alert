FROM node:22-slim AS build
WORKDIR /app
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

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
