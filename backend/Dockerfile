# Build context must be the repo root: docker build -f backend/Dockerfile .
FROM node:22-alpine
WORKDIR /app
COPY backend/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY backend/ ./
RUN npm run build
EXPOSE 4000
CMD ["npm", "start"]
