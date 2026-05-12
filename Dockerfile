FROM node:20-alpine
RUN apk add --no-cache iputils tzdata
ENV TZ=Asia/Bangkok
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p data
EXPOSE 3000
CMD ["node", "server.js"]
