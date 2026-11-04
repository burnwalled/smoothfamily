# Multi-arch build stage (arm64 on Raspberry Pi, amd64 on regular servers)
FROM node:22-alpine AS builder
WORKDIR /srv/app
COPY package.json package-lock.json ./
# Exactly the versions in the lock file – the ones the audit looked at.
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /srv/app
ENV NODE_ENV=production
COPY --from=builder /srv/app/.next/standalone ./
COPY --from=builder /srv/app/.next/static ./.next/static
COPY --from=builder /srv/app/public ./public
# Not root (2.9.0): node's own user; the file system can be mounted read-only.
USER node
EXPOSE 3000
CMD ["node", "server.js"]
