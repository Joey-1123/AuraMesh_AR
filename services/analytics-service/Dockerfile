FROM node:20-alpine
WORKDIR /app
COPY services/analytics-service/package*.json ./
RUN npm install --omit=dev
COPY services/analytics-service/server.js ./server.js
EXPOSE 8080
CMD ["npm", "start"]
