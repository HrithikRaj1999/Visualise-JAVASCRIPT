# Run from root: docker build -f apps/server/Dockerfile .
FROM node:20-alpine AS builder

WORKDIR /app

# Copy config files
COPY package*.json ./
COPY tsconfig.json ./

# Copy source code (using .dockerignore to skip node_modules)
COPY apps/server ./apps/server
COPY packages/protocol ./packages/protocol
# We don't copy apps/web to keep image smaller and build faster

# Install dependencies for the monorepo
# Note: This might warn about missing apps/web but should succeed for server
RUN npm install

# Build protocol first (dependency)
RUN npm run build -w @jsv/protocol

# Build server
RUN npm run build -w @jsv/server

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/protocol ./packages/protocol
COPY --from=builder /app/apps/server ./apps/server

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "run", "start", "-w", "@jsv/server"]
