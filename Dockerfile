FROM node:24-alpine

WORKDIR /app
COPY src ./src
COPY prisma ./prisma
COPY package*.json ./
COPY nest-cli.json ./
COPY prisma.config.ts ./
COPY tsconfig.json ./
ADD .env ./
RUN npm install
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "start"]