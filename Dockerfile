# Multi-stage production Dockerfile for vidsnag
FROM node:20-bookworm-slim AS base

# Install system dependencies: python3, curl, ffmpeg, ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp using standalone binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy application source
COPY . .

# Build Next.js web application and CLI bundle
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DOWNLOAD_DIR=/app/downloads
ENV MAX_CONCURRENT=2
ENV FILE_RETENTION_HOURS=1
ENV RATE_LIMIT_PER_MINUTE=60

# Ensure download directory exists
RUN mkdir -p /app/downloads

# Expose web interface port
EXPOSE 3000

# Start Next.js web interface
CMD ["npm", "start"]
