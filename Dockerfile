FROM --platform=$TARGETPLATFORM node:20 AS base
WORKDIR /calcom
RUN corepack enable && corepack prepare yarn@4.12.0 --activate

FROM base AS manifests
COPY package.json yarn.lock .yarnrc.yml playwright.config.ts turbo.json i18n.json ./
COPY .yarn ./.yarn
COPY apps ./apps
COPY packages ./packages
COPY example-apps ./example-apps
RUN node -e "const fs=require('fs');const path=require('path');const root='/calcom';const out='/calcom/manifests';const copy=(rel)=>{const src=path.join(root,rel);if(!fs.existsSync(src)) return;const dst=path.join(out,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst);};const walk=(dir)=>{if(!fs.existsSync(dir)) return;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const abs=path.join(dir,entry.name);if(entry.isDirectory()){walk(abs);continue;}if(entry.name==='package.json'){const rel=path.relative(root,abs);copy(rel);}}};for(const file of ['package.json','yarn.lock','.yarnrc.yml','playwright.config.ts','turbo.json','i18n.json']) copy(file);walk(path.join(root,'apps'));walk(path.join(root,'packages'));walk(path.join(root,'example-apps'));"

FROM base AS deps
COPY --from=manifests /calcom/manifests/ ./
COPY .yarn ./.yarn
RUN yarn config set httpTimeout 1200000
RUN node -e "const fs=require('fs');const p='./package.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));if(j.scripts){delete j.scripts.postinstall;}fs.writeFileSync(p,JSON.stringify(j,null,2)+'\\n');"
RUN --mount=type=cache,id=calcom-yarn-unplugged,target=/calcom/.yarn/unplugged \
  --mount=type=cache,id=calcom-node-gyp,target=/root/.cache/node-gyp \
  yarn install

FROM base AS builder
## If we want to read any ENV variable from .env file, we need to first accept and pass it as an argument to the Dockerfile
ARG NEXT_PUBLIC_LICENSE_CONSENT
ARG NEXT_PUBLIC_WEBSITE_TERMS_URL
ARG NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL
ARG CALCOM_TELEMETRY_DISABLED
ARG DATABASE_URL
ARG NEXTAUTH_SECRET=secret
ARG CALENDSO_ENCRYPTION_KEY=secret
ARG MAX_OLD_SPACE_SIZE=6144
ARG NEXT_PUBLIC_API_V2_URL
ARG CSP_POLICY
## We need these variables as required by Next.js build to create rewrites
ARG NEXT_PUBLIC_SINGLE_ORG_SLUG
ARG ORGANIZATIONS_ENABLED
ENV NEXT_PUBLIC_WEBAPP_URL=http://NEXT_PUBLIC_WEBAPP_URL_PLACEHOLDER \
  NEXT_PUBLIC_API_V2_URL=$NEXT_PUBLIC_API_V2_URL \
  NEXT_PUBLIC_LICENSE_CONSENT=$NEXT_PUBLIC_LICENSE_CONSENT \
  NEXT_PUBLIC_WEBSITE_TERMS_URL=$NEXT_PUBLIC_WEBSITE_TERMS_URL \
  NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL=$NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL \
  CALCOM_TELEMETRY_DISABLED=$CALCOM_TELEMETRY_DISABLED \
  DATABASE_URL=$DATABASE_URL \
  DATABASE_DIRECT_URL=$DATABASE_URL \
  NEXTAUTH_SECRET=${NEXTAUTH_SECRET} \
  CALENDSO_ENCRYPTION_KEY=${CALENDSO_ENCRYPTION_KEY} \
  NEXT_PUBLIC_SINGLE_ORG_SLUG=$NEXT_PUBLIC_SINGLE_ORG_SLUG \
  ORGANIZATIONS_ENABLED=$ORGANIZATIONS_ENABLED \
  NODE_OPTIONS=--max-old-space-size=${MAX_OLD_SPACE_SIZE} \
  BUILD_STANDALONE=true \
  CSP_POLICY=$CSP_POLICY
COPY package.json yarn.lock .yarnrc.yml playwright.config.ts turbo.json i18n.json ./
COPY .yarn ./.yarn
COPY apps ./apps
COPY packages ./packages
COPY example-apps ./example-apps
COPY --from=deps /calcom/node_modules ./node_modules
COPY --from=deps /calcom/.yarn/install-state.gz ./.yarn/install-state.gz
# Build and make embed servable from web/public/embed folder
RUN yarn workspace @calcom/trpc run build
RUN yarn --cwd packages/embeds/embed-core workspace @calcom/embed-core run build
RUN yarn --cwd apps/web workspace @calcom/web run copy-app-store-static
RUN yarn --cwd apps/web workspace @calcom/web run build
RUN rm -rf node_modules/.cache .yarn/cache apps/web/.next/cache

FROM node:20 AS builder-two
WORKDIR /calcom
RUN corepack enable && corepack prepare yarn@4.12.0 --activate
ARG NEXT_PUBLIC_WEBAPP_URL=http://localhost:3000
ENV NODE_ENV=production
COPY package.json .yarnrc.yml turbo.json i18n.json ./
COPY .yarn ./.yarn
COPY --from=builder /calcom/yarn.lock ./yarn.lock
COPY --from=builder /calcom/node_modules ./node_modules
COPY --from=builder /calcom/packages ./packages
COPY --from=builder /calcom/apps/web ./apps/web
COPY --from=builder /calcom/packages/prisma/schema.prisma ./prisma/schema.prisma
COPY scripts scripts
RUN chmod +x scripts/*
# Save value used during this build stage. If NEXT_PUBLIC_WEBAPP_URL and BUILT_NEXT_PUBLIC_WEBAPP_URL differ at
# run-time, then start.sh will find/replace static values again.
ENV NEXT_PUBLIC_WEBAPP_URL=$NEXT_PUBLIC_WEBAPP_URL \
  BUILT_NEXT_PUBLIC_WEBAPP_URL=$NEXT_PUBLIC_WEBAPP_URL
RUN scripts/replace-placeholder.sh http://NEXT_PUBLIC_WEBAPP_URL_PLACEHOLDER ${NEXT_PUBLIC_WEBAPP_URL}

FROM node:20 AS runner
WORKDIR /calcom
RUN corepack enable && corepack prepare yarn@4.12.0 --activate
RUN apt-get update && apt-get install -y --no-install-recommends netcat-openbsd wget && rm -rf /var/lib/apt/lists/*
COPY --from=builder-two /calcom ./
ARG NEXT_PUBLIC_WEBAPP_URL=http://localhost:3000
ENV NEXT_PUBLIC_WEBAPP_URL=$NEXT_PUBLIC_WEBAPP_URL \
  BUILT_NEXT_PUBLIC_WEBAPP_URL=$NEXT_PUBLIC_WEBAPP_URL
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=30s --retries=5 \
  CMD wget --spider http://localhost:3000 || exit 1
CMD ["/calcom/scripts/start.sh"]
