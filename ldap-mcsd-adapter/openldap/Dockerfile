FROM alpine:3.20

RUN apk add --no-cache --virtual .build-deps \
        build-base \
        git \
        libtool \
        openssl-dev \
        linux-headers \
        autoconf automake \
        libltdl \
        util-linux-dev \
        e2fsprogs-dev \
        groff \
        bash \
    && apk add --no-cache \
        ca-certificates \
        openssl \
        libltdl \
        libuuid \
    && update-ca-certificates

WORKDIR /opt

RUN git clone --branch OPENLDAP_REL_ENG_2_6_10 --depth 1 https://git.openldap.org/openldap/openldap.git

WORKDIR /opt/openldap

RUN ./configure \
        --prefix=/usr \
        --libexecdir=/usr/lib/openldap \
        --enable-slapd \
        --enable-sock \
        --with-tls=openssl \
    && make depend \
    && make -j$(nproc) \
    && make install \
    && strip /usr/lib/openldap/slapd || true \
    && apk del .build-deps \
    && rm -rf /opt/openldap /var/cache/apk/*

COPY slapd.conf /usr/etc/openldap/slapd.conf

ENV MALLOC_ARENA_MAX=1

EXPOSE 389 636
ENTRYPOINT ["/usr/lib/openldap/slapd", "-d", "1", "-f", "/usr/etc/openldap/slapd.conf"]
