# MosBot Dashboard — multi-stage build

# Stage 0: dev server with HMR (used by docker compose --profile dev)
FROM node:20-alpine AS development

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Source is bind-mounted at runtime; this just pre-installs deps
EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Stage 1: build the Vite app
FROM node:20-alpine AS build

WORKDIR /app

# Accept build-time env vars (injected by docker build --build-arg or compose args:)
ARG VITE_API_URL=http://localhost:3000/api/v1
ARG VITE_APP_NAME=MosBot

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_NAME=$VITE_APP_NAME

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: serve with nginx
FROM nginx:1.27-alpine AS production

# Remove default nginx config and add our own
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
