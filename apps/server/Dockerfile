FROM oven/bun:1.2.9

WORKDIR /usr/src/app

# Copy Node.js binary for tooling that expects it (Prisma)
COPY --from=node:20.15.1 /usr/local/bin/node /usr/local/bin/node

# Install dependencies first for better layer caching
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
RUN bun install

# Copy the rest of the application code
COPY . .

# Generate Prisma client
RUN bun run --filter @molty/server prisma:generate

# Extract version from apps/server/package.json and set build time
RUN export APP_VERSION=$(bun -p "require('./apps/server/package.json').version") && \
    export BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ") && \
    echo "APP_VERSION=$APP_VERSION" >> /tmp/build-env && \
    echo "BUILD_TIME=$BUILD_TIME" >> /tmp/build-env

# Set them as environment variables
ENV MODE=PRODUCTION

RUN export $(cat /tmp/build-env | xargs) && \
    env | grep -E "^(APP_VERSION|BUILD_TIME)=" >> /etc/environment

USER bun
EXPOSE 3000

# Set the environment variables for runtime
ENV APP_VERSION=""
ENV BUILD_TIME=""

WORKDIR /usr/src/app/apps/server

# Use a shell script to source environment and run the app
ENTRYPOINT ["/bin/sh", "-c", "export $(cat /tmp/build-env 2>/dev/null | xargs) && exec bun src/cli.ts"]
