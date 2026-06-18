# Stage 1: Build env
FROM node:20 AS builder
WORKDIR /app

# Copy package.json and lockfile or package-lock if exists
COPY package*.json ./

# Install ALL dependencies with legacy-peer-deps to avoid strict React 19 peer conflict errors
RUN npm install --legacy-peer-deps

# Copy all source files
COPY . .

# Run build compiling Vite frontend and CJS server.ts
RUN npm run build

# Stage 2: Production env
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev --legacy-peer-deps

# Copy compiled backend & frontend assets from builder
COPY --from=builder /app/dist ./dist
# Copy workspace config if available
COPY --from=builder /app/firebase-applet-config.json* ./

# Expose port 3000 (which is used in server.ts)
EXPOSE 3000

# Start server
CMD ["npm", "start"]
