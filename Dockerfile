# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG SITE_ORIGIN=https://www.fapc.sa
RUN SITE_ORIGIN="$SITE_ORIGIN" npm run build

# مرحلة اختيار صريحة: لا تنسخ src أو docs أو ملفات بيئة إلى الصورة النهائية.
RUN mkdir -p /runtime \
  && cp package.json package-lock.json /runtime/ \
  && cp -a server /runtime/server \
  && cp -a assets /runtime/assets \
  && find . -maxdepth 1 -type f \( -name '*.html' -o -name 'robots.txt' -o -name 'sitemap.xml' \) -exec cp {} /runtime/ \; \
  && for directory in ar en services articles; do if [ -d "$directory" ]; then cp -a "$directory" "/runtime/$directory"; fi; done

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080

COPY --from=build /runtime/package.json /runtime/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /runtime/ ./

USER node
EXPOSE 8080
CMD ["node", "server/index.mjs"]
