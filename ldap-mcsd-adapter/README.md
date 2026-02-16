# LDAP to mCSD adapter

Adapter to search e-mail addresses in an [mCSD](https://profiles.ihe.net/ITI/mCSD/index.html) address book, using LDAP.

Please find the interface specifications in the [`docs` directory](../docs) as "PoC 14 Specificaties koppelvlakken.docx".

## Quick start

The LDAP adapter can be started using the following command, within the `ldap-mcsd-adapter`:

```bash
docker compose up -d
```

By default, the LDAP adapter connects to `http://host.docker.internal:8080/query-directory` (where
`host.docker.internal` is the host machine). This query directory can be started using `docker compose` in the project
root. Please find the [address book readme](../address-book/README.md) for details.

To use a different mCSD directory, change the `QUERY_DIRECTORY_BASE_URL` environment variable in the `compose.yaml`
file.

The LDAP connection can be tested using the `ldapsearch` command-line tool:

```
ldapsearch -x -b "dc=HPD"
```

## TLS

The LDAP adapter listens on port `389` and `636`. TLS offloading on port `636` is handled by Nginx using the server
certificate in the `cert` directory.

## Configure in Thunderbird

To be able to query the mCSD directory in a mail client, it has to be configured first. In
[Thunderbird](https://www.thunderbird.net/) this can be done by navigating to the address book (alt+2) and click the
address book icon to add a new address book. Choose to add an LDAP address book, and enter the following details:

* Hostname: `localhost`
* Port: `389` or `636` using TLS/SSL
* Base DN: `dc=HPD`
* Bind DN: empty
