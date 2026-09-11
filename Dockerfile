FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
# @node-rs/argon2 ships prebuilt native binaries as optional deps
# (e.g. @node-rs/argon2-linux-x64-gnu) — npm resolves the right one for
# this image's platform/libc during install, no compiler needed.
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
