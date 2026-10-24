# Next.js app: REST API + admin dashboard (+ MQTT bridge later). Long-running server, not serverless.
FROM node:22-alpine
# ffmpeg converts owner recordings to the feeder's MP3 (spec Section 9, rule 7).
RUN apk add --no-cache tzdata ffmpeg
ENV TZ=Asia/Bangkok NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
