# Stage 1: Build dependency trees securely
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Minimalist Production Run Engine
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Copy optimized footprints from Builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Run under unprivileged process worker context
USER node
EXPOSE 3000

CMD ["npm", "start"]
