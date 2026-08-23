# MSE TMS — Node 22 standalone. Bind 0.0.0.0 via HOST (never OS HOSTNAME).
FROM node:22-bookworm

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
