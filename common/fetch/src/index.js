import dns from 'node:dns'
import fsp from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import stream from 'node:stream'
import { URL } from 'node:url'

import { ExtendedError } from '@bastion365/oplog'

let hosts = (async () => {
    try {
        const file = await fsp.readFile('/etc/hosts', 'utf8')
        const result = new Map()
        for (const match of file.matchAll(/^\s*?(?:(?<ip4>[0-9]{1,3}(?:\.[0-9]{1,3}){3})|(?<ip6>[0-9a-f]{0,4}(?:\:[0-9a-f]{0,4}){1,7}))\s(?<hostnames>.*)$/gim)) {
            const { ip4, ip6, hostnames } = match.groups
            for (const hostname of hostnames.split(/\s+/).map(s => s.trim())) {
                const addresses = result.get(hostname) || []
                if (ip4) {
                    addresses.push({ address: ip4, family: 4 })
                } else if (ip6) {
                    addresses.push({ address: ip6, family: 6 })
                }
                result.set(hostname, addresses)
            }
        }
        return result
    } catch (e) {
        if (e.code === 'ENOENT') {
            return // This may be a Windows environment.
        }
        throw e
    }
})()

const lookup = (hostname, options, callback) => {
    if (typeof options === 'function') {
        callback = options
        options = {}
    }
    const addressesFromHostsfile = hosts.get(hostname)
    if(addressesFromHostsfile) {
        const { family, order, all } = options

        let addresses
        if(family === 4) {
            addresses = addressesFromHostsfile.filter(a => a.family === 4)
        } else if(family === 6) {
            addresses = addressesFromHostsfile.filter(a => a.family === 6)
        } else {
            addresses = addressesFromHostsfile.slice()
        }

        if(order === 'ipv4first') {
            addresses.sort((a,b) => a.family - b.family)
        } else if(order === 'ipv6first') {
            addresses.sort((a,b) => b.family - a.family)
        }

        if (all) {
            return callback(null, addresses)
        } else {
            const {address, family} = addresses[0]
            return callback(null, address, family)
        }
    } else {
        dns.lookup(hostname, options, (err, ...args) => {
            if (err) {
                return callback(err)
            }
            callback(null, ...args)
        })
    }
}

/**
 * Fetch API with additional (low-level) options from Node.js's http/https/net/tls module.
 * @param {string|Resource} resource Resource to request.
 * @param {Object} options An object with instance members of RequestInit, and any of the options below.
 * - baseUri {string} The base URI to resolve relative URLs. Defaults to undefined on Node.js. In browser environment
 *   this defaults to window.location or WorkerGlobalScope.location (in line with the fetch standard).
 * - logger {Object} The logger object. Set to a falsy value to turn off logging. Default: undefined.
 * - throwOnError {boolean}: Throw an error when response.ok is false.
 * - timeout {number}: Timeout in milliseconds for the `fetch` method to return (i.e. a connection was made, the request
 *   has been sent and the response headers have been received). Defaults to 5 minutes for GET, DELETE, HEAD, and
 *   OPTIONS requests, and 4 hours for POST, PUT, and PATCH requests. Set to 0 to disable the timeout.
 * - query {URLSearchParams}: Query parameters to append to the URL.
 * The following options are available on Node.js only:
 * - ca {string|string[]|Buffer|Buffer[]}: Optionally override the trusted CA certificates.
 * - cert {string|Buffer}: PEM-formatted client certificate.
 * - ciphers {string}: A string describing the ciphers to use.
 * - key {string|Buffer}: PEM-formatted client certificate private key.
 * - minVersion {string}: Minimum TLS version.
 * - maxVersion {string}: Maximum TLS version.
 * - passphrase {string}: Passphrase used for the private key.
 * - retries {number}: Number of times to retry the request on a connection failure or connection timeout. Defaults to 0
 *   (no retries).
 * - retryDelay {number}: Minimum time in milliseconds between two attempts. Defaults to 3000 (3 seconds).
 * @returns {Promise<Response>} A promise that resolves with a Response object.
 */
async function fetch(resource = '', options = {}) {
    if (hosts.then) {
        hosts = await hosts
    }

    const {
        baseUri,
        ca,
        cert,
        ciphers,
        key,
        minVersion,
        maxVersion,
        logger,
        passphrase,
        query,
        retries = 0,
        retryDelay = 3000,
        throwOnError,
        timeout = ['POST', 'PUT', 'PATCH'].includes(options.method?.toUpperCase()) ? 14400000 : 300000,
        ...fetchOptions
    } = options

    let chunked = false
    if (fetchOptions.body) {
        let { body } = fetchOptions

        // To be compatible with both native fetch and Node.js's http.request(), the body should be either a
        // ReadableStream, ArrayBuffer, or ArrayBuffer view.
        if (body[Symbol.asyncIterator]) {
            chunked = true
            if (!(body instanceof ReadableStream)) {
                if (ReadableStream.from) {
                    body = ReadableStream.from(body)
                } else {
                    throw new TypeError(`Can't convert body to a ReadableStream`)
                }
            }

            // The 'half' duplex mode means the response is given after the request has been fully sent. As of 2025 this
            // is the only available mode and must be explicitly set when sending a ReadableStream as the request body.
            // The 'full' duplex mode is reserved for future use.
            fetchOptions.duplex = 'half'
        } else if (!(body instanceof ArrayBuffer || ArrayBuffer.isView(body))) {
            if (typeof body === 'string') {
                const encoder = new TextEncoder()
                body = encoder.encode(body)
            } else if (body instanceof Blob) {
                body = body.stream()
            } else if (body instanceof FormData) {
                const string = new URLSearchParams(body).toString()
                const encoder = new TextEncoder()
                body = encoder.encode(string)
            } else if (body instanceof URLSearchParams) {
                const encoder = new TextEncoder()
                body = encoder.encode(body.toString())
            } else {
                throw new TypeError(
                    `Expected body to be a async iterable, string, ArrayBuffer, ArrayBuffer view, Blob, FormData, or URLSearchParams. Received: ${
                        body?.constructor.name ?? body
                    }`,
                )
            }

            fetchOptions.headers ??= {}
            fetchOptions.headers['Content-Length'] = body.byteLength
        }
    }

    let request, url
    if (resource instanceof Request) {
        request = resource
        url = new URL(request.url)
    } else if (typeof resource === 'string' || resource?.toString) {
        url = new URL(resource.toString(), baseUri)
        const { searchParams } = url
        if (query) {
            for (const [key, value] of query) {
                searchParams.append(key, value)
            }
        }

        request = new Request(url.toString(), fetchOptions)
    } else {
        throw new TypeError(
            `Expected resource to be a string or Request. Received: ${resource?.constructor.name ?? resource}`,
        )
    }

    let timeoutSignal
    if (timeout) {
        timeoutSignal = AbortSignal.timeout(timeout)
        if (fetchOptions.signal) {
            fetchOptions.signal = AbortSignal.any(fetchOptions.signal, timeoutSignal)
        } else {
            fetchOptions.signal = timeoutSignal
        }
    }

    const start = Date.now()

    const { origin, pathname } = url
    const { method } = request
    logger?.debug(`${method} ${origin}${pathname}`)

    let response = null

    const { body, redirect, signal } = request
    const requestHeaders = [...request.headers.entries()].reduce((headers, [key, value]) => {
        headers[key] = value
        return headers
    }, {})

    let redirects = 0
    do {
        const { protocol } = url
        const clientRequest = (protocol === 'https:' ? https : http).request(url, {
            ca,
            cert,
            ciphers,
            headers: requestHeaders,
            key,
            lookup,
            method,
            minVersion,
            maxVersion,
            passphrase,
            signal,
        })

        let retryable = true
        let incomingMessage
        try {
            incomingMessage = await new Promise(async (resolve, reject) => {
                try {
                    clientRequest.on('response', incomingMessage => {
                        clientRequest.off('error', reject)
                        resolve(incomingMessage)
                    })
                    clientRequest.on('timeout', () => {
                        reject(
                            new ExtendedError(`Request to ${url.origin} timed out`, {
                                code: ExtendedError.BAD_GATEWAY,
                            }),
                        )
                    })

                    clientRequest.on('error', cause => {
                        if (timeoutSignal?.aborted) {
                            reject(
                                new ExtendedError(`Request to ${url.origin} timed out`, {
                                    code: ExtendedError.BAD_GATEWAY,
                                }),
                            )
                        } else if (signal?.aborted) {
                            reject(
                                new ExtendedError(`Request to ${url.origin} was aborted`, {
                                    code: ExtendedError.BAD_GATEWAY,
                                }),
                            )
                        } else {
                            reject(
                                new ExtendedError(`Request to ${url.origin} failed`, {
                                    code: ExtendedError.BAD_GATEWAY,
                                    cause,
                                    details: cause.message,
                                }),
                            )
                        }
                    })

                    if (body) {
                        if (chunked) {
                            retryable = false
                        }

                        await body.pipeTo(stream.Writable.toWeb(clientRequest), {
                            preventClose: true,
                            signal,
                        })
                    }

                    clientRequest.end()
                } catch (e) {
                    reject(e)
                }
            })
        } catch (e) {
            if (retryable && retries > 0) {
                const delay = retryDelay - (Date.now() - start)
                if (delay > 0) {
                    logger?.warn(`${e.message}. Retry after ${Math.round(delay / 100) / 10}s.`)
                    await new Promise(resolve => setTimeout(resolve, delay))
                } else {
                    logger?.warn(`${e.message}. Retry.`)
                }
                return fetch(resource, {
                    ...options,
                    retries: retries - 1,
                })
            }
            throw e
        }

        const { statusCode, statusMessage, headers: responseHeaders } = incomingMessage
        if (statusCode >= 300 && statusCode < 400 && redirect !== 'manual') {
            if (redirect === 'error') {
                throw new ExtendedError(`Received HTTP${statusCode} (${statusMessage}) from ${url.origin}`, {
                    code: ExtendedError.BAD_GATEWAY,
                })
            }

            try {
                if (++redirects > 20) {
                    throw new ExtendedError(`Too many redirects`, {
                        code: ExtendedError.BAD_GATEWAY,
                    })
                }

                url = new URL(responseHeaders.get('location'), url)
                continue
            } catch (e) {
                throw new ExtendedError(`Received redirect from ${url.origin} without a valid location`, {
                    code: ExtendedError.BAD_GATEWAY,
                })
            }
        }

        let responseStream
        if ([204, 205, 304].includes(statusCode)) {
            responseStream = null
            incomingMessage.destroy()
        } else {
            responseStream = stream.Readable.toWeb(incomingMessage)
        }

        response = new Response(responseStream, {
            status: statusCode,
            statusText: statusMessage,
            headers: responseHeaders,
        })
    } while (false)

    if (!response.ok && throwOnError) {
        const { status, statusText } = response
        const details = await response.text()

        // Some error codes can be propagated to the end user, while others indicate a connection or configuration
        // issue which is reported as `BAD_GATEWAY` which indicates that an invalid response was received from an
        // upstream server.
        const code =
            {
                404: ExtendedError.NOT_FOUND,
                409: ExtendedError.CONFLICT,
            }[status] ?? ExtendedError.BAD_GATEWAY
        throw new ExtendedError(`Received HTTP${status} (${statusText}) from ${url.origin}`, {
            code,
            details,
        })
    }

    return response
}

export default fetch
