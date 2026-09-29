FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
COPY tsconfig.json ./
RUN npm ci --omit=dev 2>/dev/null || npm ci 2>/dev/null || true

COPY src ./src
COPY tests ./tests
COPY migrations ./migrations

RUN npx tsc --noEmit || true
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Asia/Tehran

COPY package.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/src ./src

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http');http.get('http://localhost:8000/health',r=>{if(r.statusCode===200)process.exit(0);process.exit(1)}).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]
