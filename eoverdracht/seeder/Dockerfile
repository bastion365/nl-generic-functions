FROM alpine:3.20

RUN apk add --no-cache curl tar jq

COPY . /seeder
RUN chmod +x /seeder/seed.sh

ENTRYPOINT ["/seeder/seed.sh"]
