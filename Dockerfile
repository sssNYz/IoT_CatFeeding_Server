# Next.js app: REST API + admin dashboard (+ MQTT bridge later). Long-running server, not serverless.
FROM node:22-alpine
RUN apk add --no-cache tzdata
ENV TZ=Asia/Bangkok NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
