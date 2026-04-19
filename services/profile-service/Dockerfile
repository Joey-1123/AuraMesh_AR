FROM node:20-alpine
WORKDIR /app
COPY services/profile-service/package*.json ./
RUN npm install --omit=dev
COPY services/profile-service/server.js ./server.js
EXPOSE 8080
CMD ["npm", "start"]
