# MSE TMS — Node 22 standalone. Bind 0.0.0.0 via HOST (never OS HOSTNAME).
# Persistence is Node's built-in SQLite. No Python / g++ / node-gyp.
FROM node:22-bookworm

WORKDIR /app

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
