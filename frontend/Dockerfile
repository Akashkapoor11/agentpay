# Build context must be the repo root: docker build -f frontend/Dockerfile .
FROM node:22-alpine
WORKDIR /app
COPY frontend/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY frontend/ ./
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
