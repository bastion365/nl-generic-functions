import crypto from 'node:crypto'

import FhirClient from '@bastion365/fhir-client'
import { ExtendedError, Logger } from '@bastion365/oplog'

import { getOrganization } from './common.js'

const logger = Logger('Query Directory')

const _ = Symbol('private')

class QueryDirectory {
    constructor({ baseUri } = {}) {
        const client = new FhirClient({
            baseUri,
            logger,
        })

        this[_] = { baseUri, client }
    }

    /**
     * Add resources to the query directory.
     * @param {Array} options.resources The resources to add, as retrieved from the admin directory.
     * @param {string} options.source The FHIR base URL of the source admin directory.
     */
    async addResources({ resources = [], source = '' }) {
        if (!source) {
            throw new TypeError('source is required')
        }

        const { client } = this[_]
        const updates = resources.map(resource => {
            const { resourceType, id } = resource
            const fullUrl = `${source}/${resourceType}/${id}`
            return {
                fullUrl,
                resource,
                request: {
                    method: 'POST',
                    url: `${resource.resourceType}`,
                },
            }
        })

        const queryDirectoryIds = new Map()
        const getIdInQueryDirectory = async ({ resourceType, id }) => {
            const key = `${resourceType}/${id}`
            if (!queryDirectoryIds.has(key)) {
                const idInQueryDirectory = await this.idInQueryDirectory({ source, resourceType, id })
                queryDirectoryIds.set(key, idInQueryDirectory)
            }
            return queryDirectoryIds.get(key)
        }

        const uuids = new Map()
        for (const update of updates) {
            uuids.set(update, crypto.randomUUID())
        }

        const entry = []
        for (const update of updates) {
            entry.push(
                await this._rewriteUpdate({ update, source, allUpdates: updates, uuids, getIdInQueryDirectory }),
            )
        }

        await client.transaction({ entry })
    }

    /**
     * Get a list of all URA numbers in the query directory.
     * @returns {Array}
     */
    async allUras() {
        const { client } = this[_]
        const uras = new Set()

        const { matches = [] } = await client.search({
            resourceType: 'Organization',
            searchParams: {
                identifier: 'http://fhir.nl/fhir/NamingSystem/ura|',
            },
        })

        for (const organization of matches) {
            const { identifier = [] } = organization
            const ura = identifier.find(id => id.system === 'http://fhir.nl/fhir/NamingSystem/ura')?.value || ''
            if (ura) {
                uras.add(ura)
            }
        }

        return [...uras]
    }

    async applyUpdates({ updates = [], source = '', adminDirectory = null, lrza = null } = {}) {
        if (!source) {
            throw new TypeError('source is required')
        }
        if (!adminDirectory) {
            throw new TypeError('adminDirectory is required')
        }
        if (!lrza) {
            throw new TypeError('lrza is required')
        }

        const { client } = this[_]

        const queryDirectoryIds = new Map()
        const getIdInQueryDirectory = async ({ resourceType, id }) => {
            const key = `${resourceType}/${id}`
            if (!queryDirectoryIds.has(key)) {
                const idInQueryDirectory = await this.idInQueryDirectory({ source, resourceType, id })
                queryDirectoryIds.set(key, idInQueryDirectory)
            }
            return queryDirectoryIds.get(key)
        }

        const authoritativeUpdates = await this._authoritativeUpdates({ updates, source, lrza, getIdInQueryDirectory })
        const additionalResources = await this._requestAdditionalResources({
            authoritativeUpdates,
            adminDirectory,
            getIdInQueryDirectory,
        })
        authoritativeUpdates.push(
            ...additionalResources.map(resource => {
                const { resourceType, id } = resource
                const fullUrl = `${source}/${resourceType}/${id}`
                const request = {
                    method: 'POST',
                }
                return { fullUrl, resource, request }
            }),
        )

        const uuids = new Map()
        for (const update of authoritativeUpdates) {
            uuids.set(update, crypto.randomUUID())
        }

        const entry = []
        for (const update of authoritativeUpdates) {
            entry.push(
                await this._rewriteUpdate({ update, source, allUpdates: authoritativeUpdates, uuids, getIdInQueryDirectory }),
            )
        }

        await client.transaction({ entry })
    }

    /**
     * Rewrite the (authoritative) update from the admin directory to point to resources in the query directory. This
     * will rewrite the request part and the meta.source and references in the resource.
     */
    async _rewriteUpdate({ update = {}, source = '', allUpdates = [], uuids, getIdInQueryDirectory } = {}) {
        const { method: requestMethod = '' } = update.request
        let resource, id, resourceType, idInAdminDirectory

        if (update.resource) {
            resource = { ...update.resource }
            ;({ resourceType, id: idInAdminDirectory } = resource)
        } else {
            const { fullUrl = '' } = update
            ;[resourceType, idInAdminDirectory] = fullUrl.split('/', 3)
        }
        id = await getIdInQueryDirectory({ resourceType, id: idInAdminDirectory })

        let request
        if (requestMethod === 'DELETE') {
            request = {
                method: 'DELETE',
                url: `${resourceType}/${id}`,
            }
        } else {
            request = {
                method: id ? 'PUT' : 'POST',
                url: id ? `${resourceType}/${id}` : `${resourceType}`,
            }

            if (resource) {
                resource.meta = {
                    ...(resource.meta || {}),
                    source: `${source}/${resourceType}/${idInAdminDirectory}`,
                    versionId: undefined,
                    lastUpdated: undefined,
                }

                // Rewrite references in the resource.
                async function rewriteReference(ref = {}) {
                    const match = /^(?<resourceType>[A-Z](?:[A-Za-z]{1,63})?)\/(?<id>[A-Za-z0-9\-\.]{1,128})$/.exec(
                        ref.reference ?? '',
                    )
                    if (match) {
                        const { resourceType, id: idInAdminDirectory } = match.groups
                        const id = await getIdInQueryDirectory({ resourceType, id: idInAdminDirectory })
                        if (id) {
                            ref.reference = `${resourceType}/${id}`
                        } else {
                            const referencedUpdate = allUpdates.find(
                                ({ resource = {} }) =>
                                    resource.resourceType === resourceType && resource.id === idInAdminDirectory,
                            )

                            if (referencedUpdate) {
                                ref.reference = `urn:uuid:${uuids.get(referencedUpdate)}`
                            } else {
                                // Reference to a resource outside the update set and not in the query directory. Remove
                                // the reference.
                                ref.reference = undefined
                            }
                        }
                    } else {
                        ref.reference = undefined
                    }

                    if (!ref.reference && !ref.identifier && !ref.display) {
                        // Remove the reference altogether, instead of making an external reference.
                        ref = null
                    }
                    return ref
                }

                const referenceFields =
                    {
                        Organization: ['partOf', 'endpoint'],
                        Location: ['managingOrganization', 'partOf', 'endpoint'],
                        HealthcareService: ['providedBy', 'location', 'coverageArea', 'endpoint'],
                        Endpoint: ['managingOrganization'],
                        PractitionerRole: ['practitioner', 'organization', 'location', 'healthcareService', 'endpoint'],
                        Practitioner: ['qualification.issuer'],
                    }[resourceType] ?? []
                for (const path of referenceFields) {
                    let object = resource
                    const parts = path.split('.')
                    const field = parts.pop()
                    for (const part of parts) {
                        object = object[part] || {}
                    }
                    let value = object[field]
                    if (!value) {
                        continue
                    }

                    if (Array.isArray(value)) {
                        value = (await Promise.all(value.map(v => rewriteReference(v)))).filter(Boolean)
                        if (value.length === 0) {
                            value = undefined
                        }
                    } else {
                        value = await rewriteReference(value)
                        if (!value) {
                            value = undefined
                        }
                    }
                    object[field] = value
                }

                resource.id = undefined
            }
        }

        return {
            fullUrl: `urn:uuid:${uuids.get(update)}`,
            resource,
            request,
        }
    }

    /**
     * Given a list of authoritative updates, request additional resources that are referenced by these updates.
     * This includes Practitioner resources referenced by (new or updated) PractitionerRole resources, and Endpoint
     * resources referenced by (new or updated) Organization resources, in case the referenced resource was already
     * present in the admin directory, but not in the query directory.
     */
    async _requestAdditionalResources({
        authoritativeUpdates = [],
        adminDirectory = null,
        getIdInQueryDirectory,
    } = {}) {
        const additionalResources = []
        for (const { resource = {} } of authoritativeUpdates) {
            const { resourceType } = resource
            if (resourceType === 'Organization') {
                const { endpoint = [] } = resource
                for (const { reference = '' } of endpoint) {
                    const [referencedType, referencedId] = reference.split('/', 2)
                    if (referencedType !== 'Endpoint') {
                        continue // This is not a literal and internal reference.
                    }

                    const inUpdateSet = authoritativeUpdates.some(
                        ({ resource = {} }) => resource.resourceType === referencedType && resource.id === referencedId,
                    )
                    if (
                        !(
                            inUpdateSet ||
                            (await getIdInQueryDirectory({ resourceType: referencedType, id: referencedId }))
                        )
                    ) {
                        const resource = await adminDirectory.getResource({
                            resourceType: referencedType,
                            id: referencedId,
                        })
                        additionalResources.push(resource)
                    }
                }
            } else if (resourceType === 'PractitionerRole') {
                const { practitioner = {} } = resource
                const [referencedType, referencedId] = (practitioner.reference ?? '').split('/', 2)
                if (referencedType !== 'Practitioner') {
                    continue // This is not a literal and internal reference.
                }

                const inUpdateSet = authoritativeUpdates.some(
                    ({ resource = {} }) => resource.resourceType === referencedType && resource.id === referencedId,
                )
                if (
                    !(inUpdateSet || (await getIdInQueryDirectory({ resourceType: referencedType, id: referencedId })))
                ) {
                    const resource = await adminDirectory.getResource({
                        resourceType: referencedType,
                        id: referencedId,
                    })
                    additionalResources.push(resource)
                }
            }
        }
        return additionalResources
    }

    /**
     * Filter the list of updates to only those for which the source is authoritative.
     */
    async _authoritativeUpdates({ updates = [], source = '', lrza = null, getIdInQueryDirectory } = {}) {
        /*
         * Step 1: Split updates the following categories:
         * - Authoritative: resources that already exist in the query directory (with the same source) or top-level
         *   organizations for which the source is authoritative according to the LRZa.
         * - Potentially Authoritative: resources that do not yet exist in the query directory, but the owning resource
         *   may be in the query directory or the current update set, and may be authoritative.
         * - Updates that do not fall in any of the above categories will be ignored.
         */
        const authoritativeUpdates = [],
            potentiallyAuthoritativeUpdates = []
        for (let i = 0; i < updates.length; ++i) {
            const update = updates[i]
            const { fullUrl = '', resource, request = {} } = update
            const { method = '' } = request

            // Skip this update if there is a later update for the same resource.
            if (updates.slice(i + 1).some(u => u.fullUrl === fullUrl)) {
                continue
            }

            let resourceType, id
            if (resource) {
                ;({ resourceType, id } = resource)
            } else {
                ;[resourceType, id] = fullUrl.split('/').slice(-2)
            }

            const idInQueryDirectory = await getIdInQueryDirectory({ resourceType, id })
            if (idInQueryDirectory) {
                authoritativeUpdates.push(update)
            } else {
                // This resource does not (yet) exist in the query directory.
                if (method === 'DELETE') {
                    // This is an update to delete a resource which is not in the query directory. Can be skipped.
                    continue
                } else if (resourceType === 'Organization' && !resource?.partOf) {
                    // Get the URA number and check in the LRZa if this source is authoritative for this organization.
                    const { identifier = [] } = resource || {}
                    const ura = identifier.find(id => id.system === 'http://fhir.nl/fhir/NamingSystem/ura')?.value || ''
                    if (!ura) {
                        continue
                    }

                    const autoritative = await lrza.organizationByUra({ ura })
                    if (!autoritative) {
                        continue
                    }
                    if (autoritative.adminDirectoryEndpoint.address !== source) {
                        continue
                    }
                    authoritativeUpdates.push(update)
                } else {
                    let ownerReference
                    if (resourceType === 'Organization') {
                        ownerReference = resource.partOf
                    } else if (resourceType === 'Location') {
                        ownerReference = resource.managingOrganization
                    } else if (resourceType === 'HealthcareService') {
                        ownerReference = resource.providedBy
                    } else if (resourceType === 'PractitionerRole') {
                        ownerReference = resource.organization
                    }

                    if (!ownerReference?.reference) {
                        continue
                    }

                    const owner = (() => {
                        const [resourceType, id] = ownerReference.reference.split('/').slice(-2)
                        return { resourceType, id }
                    })()
                    potentiallyAuthoritativeUpdates.push({ update, owner })
                }
            }
        }

        /*
         * Step 2: Iterate through potentially authoritative updates, and check if the owning resource is in the
         * authoritative updates.
         */
        let foundAuthoritativeUpdate
        do {
            foundAuthoritativeUpdate = false
            for (let i = 0; i < potentiallyAuthoritativeUpdates.length; ++i) {
                const { update, owner } = potentiallyAuthoritativeUpdates[i]
                const authoritative = authoritativeUpdates.find(
                    ({ resource = {} }) => resource.resourceType === owner.resourceType && resource.id === owner.id,
                )
                if (authoritative) {
                    authoritativeUpdates.push(update)
                    potentiallyAuthoritativeUpdates.splice(i, 1)
                    --i
                    foundAuthoritativeUpdate = true
                }
            }
        } while (foundAuthoritativeUpdate)

        /*
         * Step 3: A Location, HealthcareService, or PractitionerRole may be added to an existing Organization. Check if
         * the owner is in the query directory.
         */
        for (const { update, owner } of potentiallyAuthoritativeUpdates) {
            const ownerIdInQueryDirectory = await getIdInQueryDirectory(owner)
            if (ownerIdInQueryDirectory) {
                authoritativeUpdates.push(update)
            }
        }

        /*
         * Step 4: For Organization updates, get the authoritative name from the LRZa.
         */
        for(const authoritativeUpdate of authoritativeUpdates) {
            const { resource = {} } = authoritativeUpdate
            const { resourceType } = resource
            if(resourceType === 'Organization') {
                const { identifier = [] } = resource || {}
                const ura = identifier.find(id => id.system === 'http://fhir.nl/fhir/NamingSystem/ura')?.value || ''
                if(ura) {
                    const org = await lrza.organizationByUra({ ura })
                    if(org?.name) {
                        resource.name = org.name
                    }
                }
            }
        }

        return authoritativeUpdates
    }

    /**
     * Delete an organization by URA.
     * @param {string} options.ura The URA of the organization to delete.
     */
    async deleteOrganization({ ura }) {
        const { client } = this[_]

        const resources = await getOrganization({ client, logger, ura })

        const entry = resources.map(resource => {
            const { resourceType, id } = resource
            return {
                request: {
                    method: 'DELETE',
                    url: `${resourceType}/${id}`,
                },
            }
        })

        await client.transaction({ entry })
    }

    async idInQueryDirectory({ source = '', resourceType = '', id = '' } = {}) {
        const { client } = this[_]

        const { matches = [] } = await client.search({
            resourceType,
            searchParams: {
                _source: `${source}/${resourceType}/${id}`,
            },
        })
        if(matches.length === 0) {
            return null
        }

        try {
            const [{ resourceType, id }] = matches
            const resource = await client.read({ resourceType, id })
            return resource.id
        } catch(e) {
            if([ExtendedError.NOT_FOUND, ExtendedError.GONE].includes(e.code)) {
                return null
            }
            throw e
        }
    }
}

export default QueryDirectory
