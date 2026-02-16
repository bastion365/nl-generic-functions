# syntax=docker/dockerfile:1.4

ARG NODE_VERSION=22.12
ARG OS_VERSION=bookworm
ARG NODE_ENV=production

#########
# Tools #
#########
FROM node:${NODE_VERSION}-${OS_VERSION} AS tools

# Install Docker CLI and Compose plugin
RUN apt-get update && apt-get install -y \
    ca-certificates curl gnupg lsb-release && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
      https://download.docker.com/linux/debian $(lsb_release -cs) stable" \
      > /etc/apt/sources.list.d/docker.list && \
    apt-get update && apt-get install -y docker-ce-cli docker-compose-plugin docker-buildx-plugin && \
    rm -rf /var/lib/apt/lists/*

#########
# Build #
#########
FROM node:${NODE_VERSION}-${OS_VERSION} AS build
ARG NODE_ENV

WORKDIR /home/node

COPY --from=monorepo . .

RUN npm ci --workspaces

# Copy the source to get a directory structure with both source and node_modules.
COPY --from=address-book . ./address-book
COPY --from=common . ./common

#########
# Final #
#########
FROM node:${NODE_VERSION}-${OS_VERSION} AS final

WORKDIR /home/node

COPY --from=tools /usr/bin/docker /usr/bin/docker
COPY --from=tools /usr/libexec/docker/cli-plugins/docker-compose /usr/libexec/docker/cli-plugins/docker-compose
COPY --from=tools /usr/libexec/docker/cli-plugins/docker-buildx /usr/libexec/docker/cli-plugins/docker-buildx

COPY --from=build /home/node/package*.json .
COPY --from=build /home/node/node_modules ./node_modules
COPY --from=build /home/node/address-book ./address-book
COPY --from=build /home/node/common ./common

ENTRYPOINT ["npm", "test", "--workspace", "address-book-test"]
