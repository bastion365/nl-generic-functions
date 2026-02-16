import FhirClient from '@bastion365/fhir-client'
import { ExtendedError, Logger } from '@bastion365/oplog'

const logger = Logger('LRZa')

const _ = Symbol('private')

class LRZa {
    constructor({ baseUri } = {}) {
        const client = new FhirClient({
            baseUri,
            logger,
        })

        this[_] = { baseUri, client }
    }

    /**
     * List all organizations.
     * @returns {AsyncGenerator} Yields an object with the ura (string), name (string), and adminDirectoryEndpoint
     * (string) of the administration directory who is authoritative for this organization.
     */
    async *allOrganizations() {
        const { client } = this[_]
        const { matches: organizations = [], includes = [] } = await client.search({
            resourceType: 'Organization',
            searchParams: {
                _count: 1000,
                _include: 'Organization:endpoint',
            },
        })

        for (const organization of organizations) {
            const { identifier = [], name = '' } = organization
            const ura = identifier.find(id => id.system === 'http://fhir.nl/fhir/NamingSystem/ura')?.value || ''
            if (!ura) {
                logger.warn(`Organization/${organization.id} (${name}) has no URA identifier`)
                continue
            }

            const endpoints = (organization.endpoint ?? []).map(({ reference = {} }) => {
                const [resourceType, id] = (reference || '').split('/', 2)
                return includes.find(resource => resource.resourceType === resourceType && resource.id === id)
            })
            const adminDirectoryEndpoint = endpoints.find(endpoint =>
                endpoint.meta?.profile?.includes(
                    'http://nuts-foundation.github.io/nl-generic-functions-ig/StructureDefinition/nl-gf-endpoint',
                ),
            ) || endpoints.find(endpoint =>
                endpoint.payloadType?.find(pt =>
                    pt.coding?.find(coding =>
                        coding.system === 'http://nuts-foundation.github.io/nl-generic-functions-ig/CodeSystem/nl-gf-data-exchange-capabilities' &&
                        coding.code ===  'http://nuts-foundation.github.io/nl-generic-functions-ig/CapabilityStatement/nl-gf-admin-directory-update-client'
                    ),
                ),
            )
            if (!adminDirectoryEndpoint) {
                logger.warn(`Organization with URA ${ura} (${name}) has no nl-gf-endpoint`)
                continue
            }

            yield { ura, name, adminDirectoryEndpoint }
        }
    }

    async organizationByUra({ ura = '' } = {}) {
        const { client } = this[_]
        const { matches: organizations = [], includes = [] } = await client.search({
            resourceType: 'Organization',
            searchParams: {
                identifier: `http://fhir.nl/fhir/NamingSystem/ura|${ura}`,
                _include: 'Organization:endpoint',
            },
        })

        if (organizations.length === 0) {
            return null
        }

        const organization = organizations[0]
        const { name = '' } = organization

        const endpoints = (organization.endpoint ?? []).map(({ reference = {} }) => {
            const [resourceType, id] = (reference || '').split('/', 2)
            return includes.find(resource => resource.resourceType === resourceType && resource.id === id)
        })
        const adminDirectoryEndpoint = endpoints.find(endpoint =>
            endpoint.payloadType?.find(pt =>
                pt.coding?.find(coding =>
                    coding.system === 'http://nuts-foundation.github.io/nl-generic-functions-ig/CodeSystem/nl-gf-data-exchange-capabilities' &&
                    coding.code ===  'http://nuts-foundation.github.io/nl-generic-functions-ig/CapabilityStatement/nl-gf-admin-directory-update-client'
                ),
            ),
        )
        if (!adminDirectoryEndpoint) {
            logger.warn(`Organization with URA ${ura} (${name}) has no nl-gf-endpoint`)
            return null
        }

        return { ura, name, adminDirectoryEndpoint }
    }

    /**
     * Get updated organizations since a given time.
     * @param {number} options.since Timestamp (in milliseconds since epoch).
     * @returns {AsyncGenerator} Yields an object with the ura (string), name (string), and adminDirectoryEndpoint
     * (string) of the administration directory who is now authoritative for this organization. For deleted
     * organizations, there will be no adminDirectoryEndpoint.
     */
    async *updatedOrganizations({ since = 0 } = {}) {
        const { client } = this[_]
        const updates = (
            await client.history({
                resourceType: 'Organization',
                since: new Date(since).toISOString(),
            })
        ).reverse()
        for (let i = 0; i < updates.length; ++i) {
            const { fullUrl, resource, request } = updates[i]

            // Skip this update if there is a later update for the same organization.
            if (updates.slice(i + 1).some(u => u.fullUrl === fullUrl)) {
                continue
            }

            let organization = resource
            const { method = '' } = request
            if (method === 'DELETE') {
                const { url = '' } = request
                const [resourceType, id] = url.split('/', 2)
                const history = await client.history({
                    resourceType,
                    id,
                })
                organization = history.find(entry => entry.resource)?.resource
                if (!organization) {
                    continue
                }
            }

            const { identifier = [], name = '' } = organization
            const ura = identifier?.find(id => id.system === 'http://fhir.nl/fhir/NamingSystem/ura')?.value
            if (!ura) {
                logger.warn(`Organization/${organization.id} (${organization.name}) has no URA identifier`)
                continue
            }

            let endpoints
            if (organization.endpoint) {
                const { matches = [] } = await client.search({
                    resourceType: 'Endpoint',
                    searchParams: {
                        _id: organization.endpoint?.map(({ reference = '' }) => reference.split('/', 3)[1]).join(','),
                    },
                })
                endpoints = matches
            } else {
                endpoints = []
            }

            let adminDirectoryEndpoint
            if (method !== 'DELETE') {
                adminDirectoryEndpoint = endpoints.find(endpoint =>
                    endpoint.payloadType?.find(pt =>
                        pt.coding?.find(coding =>
                            coding.system === 'http://nuts-foundation.github.io/nl-generic-functions-ig/CodeSystem/nl-gf-data-exchange-capabilities' &&
                            coding.code ===  'http://nuts-foundation.github.io/nl-generic-functions-ig/CapabilityStatement/nl-gf-admin-directory-update-client'
                        ),
                    ),
                )
                if (!adminDirectoryEndpoint) {
                    logger.warn(`Organization with URA ${ura} (${name}) has no nl-gf-endpoint`)
                    continue
                }
            }

            yield { ura, name, adminDirectoryEndpoint }
        }
    }
}

export default LRZa
