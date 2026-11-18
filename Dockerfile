# Source: https://github.com/vercel/next.js/blob/canary/examples/with-docker/README.md

# Install dependencies only when needed
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Rebuild the source code only when needed
FROM node:22-alpine AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production image, copy all the files and run next
FROM node:22-alpine AS runner
WORKDIR /app
# Define a build argument
ARG VERSION=dev

# Set the build argument as an environment variable
ENV VERSION=$VERSION

ENV NODE_ENV=production

RUN apk add --no-cache curl

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# You only need to copy next.config.js if you are NOT using the default configuration
# COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/src/db/migrations ./src/db/migrations

# Copy native libsql binaries — Next.js standalone tracing misses dynamically required native modules
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@libsql ./node_modules/@libsql
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/libsql ./node_modules/libsql

# Same insurance for sharp (Face Review's face-crop endpoint): its platform
# binaries live in @img/* optional deps that standalone tracing can miss.
# sharp itself comes via Next's optionalDependencies, not package.json.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/sharp ./node_modules/sharp
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@img ./node_modules/@img
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/detect-libc ./node_modules/detect-libc
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/semver ./node_modules/semver

RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

ENV PORT=3000

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry.
ENV NEXT_TELEMETRY_DISABLED=1

ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]

HEALTHCHECK CMD curl --fail http://localhost:3000/api/health || exit 1
