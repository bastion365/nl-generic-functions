# @bastion365/mitz-connector

Localise medical data and verify consent using [Mitz](https://www.mitz-toestemming.nl/).

## API documentation

Please find [API.md](API.md).

To regenerate the API documentation, run `docker compose run generate-docs`.

## Certificate

The connection to Mitz requires authentication using mTLS, using a PKIo or GZN client certificate. This library only
supports RSA certificates (at the time of writing there are no plans to issue ECC certificates under the PKIo root).

To accept the TLS certificate used by Mitz, pass the PKIo root CA's as `ca` in the options. These CA certificates can be
found on [https://cert.pkioverheid.nl/](cert.pkioverheid.nl).

## Tests

To run the test scripts, please review the configuration in `config/default.json5` and put the following files in the cert directory:

* `client.crt` - PEM-formatted public certificate
* `client.key` - PEM-formatted private key
* `ca.crt` - PEM-formatted certificate(s) which act as trust anchor for validating Mitz's server certificate. This file should include the PKIO root certificates.

The test scripts can be run using the following command:

```bash
docker compose run test
```

To run a single test, append the test file, e.g.:

```bash
docker compose run test test/open.test.js
```

By default, tests run against the Mitz TST-US test environment. Running the tests requires access to this environment. Also, running the tests will change data in this environment (e.g. by adding a new subscription) and will lead to logs and notifications in 'Mijn Mitz'.
