# ----------- BUILD STAGE -----------
FROM node:24-alpine AS builder

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build
RUN npx prisma generate

# ----------- PRODUCTION STAGE -----------
FROM node:24-alpine

WORKDIR /app

# Copy only necessary files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Optional: copy package.json for metadata
COPY package*.json ./

EXPOSE 8003

CMD ["node", "dist/src/main.js"]