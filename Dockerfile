# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG SITE_ORIGIN=https://www.fapc.sa
RUN SITE_ORIGIN="$SITE_ORIGIN" npm run build \
  && FURSAN_RUNTIME_DIST_DIR=/runtime node scripts/prepare-runtime.mjs

# تعتمد صورة operations وcombined فقط على SDK خادمي. لا تستخدمها صورة website.
FROM node:22-bookworm-slim AS operations-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# الموقع التسويقي: لا node_modules ولا Firestore ولا server/operations ولا أي أصل operations.
FROM node:22-bookworm-slim AS website
WORKDIR /app
ENV NODE_ENV=production \
    APP_ENV=production \
    PORT=8080 \
    FURSAN_DEPLOYMENT_PROFILE=website \
    LEAD_SINK=disabled \
    FURSAN_MASTER_SYNC=disabled
COPY --from=build /runtime/website/ ./
COPY --from=build /app/server/runtime/website-index.mjs ./server/runtime/website-index.mjs
COPY --from=build /app/server/website-app.mjs ./server/website-app.mjs
COPY --from=build /app/server/app.mjs ./server/app.mjs
COPY --from=build /app/server/config.mjs ./server/config.mjs
COPY --from=build /app/server/cloud-run-origin.mjs ./server/cloud-run-origin.mjs
COPY --from=build /app/server/deployment-profile.mjs ./server/deployment-profile.mjs
COPY --from=build /app/server/http-static.mjs ./server/http-static.mjs
COPY --from=build /app/server/validation.mjs ./server/validation.mjs
USER node
EXPOSE 8080
CMD ["node", "server/runtime/website-index.mjs"]

# الإدارة: نواة operations فقط، أصولها المحددة، وSDK الخادمي اللازم لـFirestore/IAP.
FROM node:22-bookworm-slim AS operations
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    FURSAN_DEPLOYMENT_PROFILE=operations \
    LEAD_SINK=disabled \
    FURSAN_MASTER_SYNC=disabled \
    OPS_AI_ENABLED=false
COPY --from=operations-deps /app/node_modules ./node_modules
COPY --from=build /runtime/operations/ ./
COPY --from=build /app/server/runtime/operations-index.mjs ./server/runtime/operations-index.mjs
COPY --from=build /app/server/operations-app.mjs ./server/operations-app.mjs
COPY --from=build /app/server/deployment-profile.mjs ./server/deployment-profile.mjs
COPY --from=build /app/server/http-static.mjs ./server/http-static.mjs
COPY --from=build /app/server/validation.mjs ./server/validation.mjs
COPY --from=build /app/server/operations ./server/operations
USER node
EXPOSE 8080
CMD ["node", "server/runtime/operations-index.mjs"]

# الوضع المدمج يبقى متاحًا حصريًا لتوافق Staging الحالي؛ ليس هدف الإنتاج المفصول.
FROM node:22-bookworm-slim AS combined
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    FURSAN_DEPLOYMENT_PROFILE=combined
COPY --from=operations-deps /app/node_modules ./node_modules
COPY --from=build /runtime/combined/ ./
COPY --from=build /app/server ./server
USER node
EXPOSE 8080
CMD ["node", "server/runtime/combined-index.mjs"]
