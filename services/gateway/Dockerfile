FROM node:20-alpine
WORKDIR /app
COPY services/gateway/package*.json ./
RUN npm install --omit=dev
COPY services/gateway/server.js ./server.js
COPY frontend ./frontend
EXPOSE 8080
CMD ["npm", "start"]
