FROM node:20-alpine
WORKDIR /app
COPY services/gesture-service/package*.json ./
RUN npm install --omit=dev
COPY services/gesture-service/server.js ./server.js
EXPOSE 8080
CMD ["npm", "start"]
