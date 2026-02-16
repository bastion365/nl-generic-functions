# @bastion365/client-fetch

Fetch API with additional options.

## Additional options

This section describes the options which are available on top op native fetch.

### TLS and connection options (Node.js only)

The following options from [tls.connect()](https://nodejs.org/docs/latest-v22.x/api/tls.html#tlsconnectoptions-callback) are supported:

* `ca`
* `cert`
* `key`
* `passphrase`

### Other options

* `baseUri` to resolve relative URLs (or to override the default in a browser environment, which is `window.location` or `WorkerGlobalScope.location`).
* `logger` to add a log line on creating a request.
* `throwOnError` to throw an error when `response.ok` is false.
* `query` An array of query parameters to append to the URL.
