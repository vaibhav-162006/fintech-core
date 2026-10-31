FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
EXPOSE 4000
CMD ["npx" , "tsx" , "src/server.ts"]