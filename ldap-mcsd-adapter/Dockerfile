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
COPY --from=ldap-mcsd-adapter . ./ldap-mcsd-adapter
COPY --from=common . ./common

#########
# Final #
#########
FROM node:${NODE_VERSION}-${OS_VERSION} AS final
WORKDIR /home/node
ARG NODE_ENV

COPY --from=build /home/node/package*.json .
COPY --from=build /home/node/node_modules ./node_modules

COPY --from=build /home/node/ldap-mcsd-adapter/mapping ./ldap-mcsd-adapter/mapping
COPY --from=build /home/node/ldap-mcsd-adapter/src ./ldap-mcsd-adapter/src
COPY --from=build /home/node/common/fetch ./common/fetch
COPY --from=build /home/node/common/fhir-client ./common/fhir-client
COPY --from=build /home/node/common/oplog ./common/oplog

ENV NODE_ENV=${NODE_ENV}

USER node
RUN mkdir /home/node/slapd-sock
ENTRYPOINT node ./ldap-mcsd-adapter/src/app.js
