import { ExtendedError } from '@bastion365/oplog'

import fetch from '@bastion365/fetch'

const _ = Symbol('private')

const ETAG = Symbol('eTag')

class RestClient {
    /**
     * Create a new client for the FHIR ReST API. This client is linked to a single FHIR server.
     * @param {string} options.baseUri The base URL of the FHIR server.
     * @param {Object?} options.logger The logger object. Default: console.
     * @param {(result: Object) => Object} options.afterResult? Hook to modify a retrieved resource or search result
     * before returning it.
     * ...any options of @bastion365/fetch, except `body`, `headers`, `method`, and `query`.
     */
    constructor({
        baseUri,
        logger = console,
        afterResult = o => o,
        body, // added here to prevent passing it to fetch
        headers, // idem
        method, // idem
        query, // idem
        ...rest
    } = {}) {
        if (!baseUri) {
            throw new TypeError('baseUri is required')
        }
        if (!baseUri.endsWith('/')) {
            baseUri += '/'
        }

        const fetchOptions = {
            baseUri,
            logger,
            ...rest,
            throwOnError: true,
        }

        this[_] = {
            logger,
            fetchOptions,
            afterResult,
        }
    }

    async create(resource = {}) {
        const { fetchOptions } = this[_]

        const { resourceType } = resource
        const body = JSON.stringify(resource)

        const response = await fetch(resourceType, {
            ...fetchOptions,
            headers: {
                'Content-Type': 'application/fhir+json',
                Accept: 'application/fhir+json',
            },
            method: 'POST',
            body,
        })

        return await this._resourceFromResponse(response)
    }

    async delete({ resourceType = '', id = '' } = {}) {
        const { fetchOptions } = this[_]

        const path = `${encodeURIComponent(resourceType)}/${encodeURIComponent(id)}`

        await fetch(path, {
            ...fetchOptions,
            method: 'DELETE',
        })
    }

    async read({ resourceType = '', id = '' } = {}) {
        const { fetchOptions } = this[_]

        const path = `${encodeURIComponent(resourceType)}/${encodeURIComponent(id)}`

        const response = await fetch(path, {
            ...fetchOptions,
            headers: {
                Accept: 'application/fhir+json',
            },
        })

        return await this._resourceFromResponse(response)
    }

    async history({ resourceType = '', id = '', since = null } = {}) {
        const { fetchOptions } = this[_]

        const path = `${encodeURIComponent(resourceType)}/${id ? `${encodeURIComponent(id)}/` : ''}_history`
        const query = new URLSearchParams()

        if (since) {
            query.set('_since', new Date(since).toISOString())
        }

        const response = await fetch(path, {
            ...fetchOptions,
            headers: {
                Accept: 'application/fhir+json',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cache-Control': 'no-cache',
            },
            method: 'GET',
            query,
        })

        const { entry = [] } = await this._resourceFromResponse(response)
        return entry
    }

    async search({ resourceType = '', searchParams = {}, method = 'POST' } = {}) {
        const { fetchOptions, logger } = this[_]

        const path = method === 'POST' ? `${encodeURIComponent(resourceType)}/_search` : encodeURIComponent(resourceType)
        const query = new URLSearchParams(
            Object.entries(searchParams).reduce((acc, [k, v]) => (v ? { ...acc, [k]: v } : acc), {}),
        )

        const response = await fetch(path, {
            ...fetchOptions,
            headers: {
                Accept: 'application/fhir+json',
                'Cache-Control': 'no-cache',
                ...(method === 'POST'
                    ? {
                          'Content-Type': 'application/x-www-form-urlencoded',
                      }
                    : {}),
            },
            method,
            ...(method === 'POST'
                ? {
                      body: query.toString(),
                  }
                : {
                      query,
                  }),
        })

        const { entry = [] } = await this._resourceFromResponse(response)
        const results = entry.reduce((acc, { resource, search = {} }) => {
            const { mode = 'match' } = search
            if (!acc[mode]) {
                acc[mode] = []
            }
            acc[mode].push(resource)
            return acc
        }, {})

        return {
            matches: results.match ?? [],
            includes: results.include ?? [],
            outcomes: results.outcome ?? [],
        }
    }

    async transaction({ entry = [] } = {}) {
        const { fetchOptions } = this[_]

        const body = JSON.stringify({
            resourceType: 'Bundle',
            type: 'transaction',
            entry,
        })

        const response = await fetch('', {
            ...fetchOptions,
            headers: {
                Accept: 'application/fhir+json',
                'Content-Type': 'application/fhir+json',
            },
            method: 'POST',
            body,
        })
    }

    async _resourceFromResponse(response) {
        const { headers } = response
        const [contentType, contentTypeParameters] = (headers.get('Content-Type') ?? '').split(';')
        if (!['application/fhir+json', 'application/json'].includes(contentType)) {
            throw new ExtendedError(
                `Expected ${'application/fhir+json'} response from upstream server. Received: ${contentType}`,
                {
                    code: ExtendedError.BAD_GATEWAY,
                },
            )
        }
        const resource = await response.json()
        resource[ETAG] = headers.get('ETag')
        return resource
    }
}

export default RestClient
