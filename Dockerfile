FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY package.json ./
COPY public ./public
COPY server ./server
COPY hosting ./hosting
COPY drizzle ./drizzle
EXPOSE 3000
CMD ["node", "hosting/server.mjs"]
