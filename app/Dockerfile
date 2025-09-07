FROM node:20-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY package.json ./
RUN npm install 
COPY server.js ./
COPY .dockerignore ./
USER app
EXPOSE 3000
CMD ["node", "server.js"]