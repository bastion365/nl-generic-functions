ARG NODE_VERSION=22.12
ARG OS_VERSION=bookworm

#########
# Build #
#########
FROM node:${NODE_VERSION}-${OS_VERSION} AS build
WORKDIR /home/node
ARG NODE_VERSION
ARG NODE_ENV
ARG OS_VERSION

COPY --from=monorepo . .

RUN npm ci --workspaces

# Copy the source to get a directory structure with both source and node_modules.
COPY --from=demo-client . ./demo-client
COPY --from=common . ./common

# #########
# # Final #
# #########
FROM node:${NODE_VERSION}-${OS_VERSION} AS final
WORKDIR /home/node
ARG NODE_ENV

COPY --from=build /home/node/package*.json .
COPY --from=build /home/node/node_modules ./node_modules
COPY --from=build /home/node/demo-client ./demo-client
COPY --from=build /home/node/common ./common

ENV NODE_ENV=${NODE_ENV}

USER node
ENTRYPOINT ["node", "./demo-client/src/app.js"]
