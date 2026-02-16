FROM alpine:3.20 AS builder
COPY . /seed
RUN chmod +x /seed/seed.sh

FROM curlimages/curl:8.1.2
COPY --from=builder /seed /seed
ENTRYPOINT ["sh", "/seed/seed.sh"]
