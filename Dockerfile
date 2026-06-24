# ----------- BUILD STAGE -----------
FROM node:24-alpine AS builder

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --config.dangerouslyAllowAllBuilds=true
COPY . .
RUN npx prisma generate
RUN pnpm run build
   

# ----------- PRODUCTION STAGE -----------
FROM node:24-alpine

WORKDIR /app

# Copy only necessary files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/generated ./generated

# Optional: copy package.json for metadata
COPY package*.json ./
RUN mkdir -p \
    /app/uploads/users \
    /app/uploads/products \
    /app/uploads/avatars && \
    chown -R node:node /app/uploads

USER node



EXPOSE 8003

CMD ["node", "dist/src/main.js"]