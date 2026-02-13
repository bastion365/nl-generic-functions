import fsp from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve as resolvePath } from 'node:path'

import FhirClient from '@bastion365/fhir-client'
import { ExtendedError, Logger } from '@bastion365/oplog'
import jsonata from 'jsonata'

import applyFilter from '../utils/applyFilter.js'
import filterToFhir from '../utils/filterToFhir.js'
import parseSearchFilter from '../utils/parseSearchFilter.js'

const logger = Logger('search')

const HOMEDIR = homedir()

const {
    QUERY_DIRECTORY_BASE_URL = '',
} = process.env

// See: https://datatracker.ietf.org/doc/html/rfc4511#section-4.5.1

const mappings = Object.fromEntries(await Promise.all(['Organization', 'Location', 'Endpoint'].map(async resourceType => {
    const definition = (await fsp.readFile(resolvePath(HOMEDIR, `ldap-mcsd-adapter/mapping/${resourceType.toLowerCase()}.jsonata`))).toString()
    const mapping = jsonata(definition)
    return [ resourceType, mapping ]
})))

export default async function* search(message) {
    const { attrs, attrsonly, connid, binddn, filter, msgid, scope, sizelimit } = message
    logger.info(`[${connid}:${msgid}] SEARCH operation for DN: ${binddn}`)
    const parsedFilter = parseSearchFilter(filter)

    const {names, resourceTypes = ['Organization', 'Location']} = filterToFhir(parsedFilter)

    // Run search against your data store here using parsedFilter, scope, attrs, attrsonly, etc.
    const addressBook = new FhirClient({
        baseUri: QUERY_DIRECTORY_BASE_URL,
        logger,
    })
    const searchParams = {}
    if (names && names.length > 0) {
        searchParams.name = names.map(name => `${name.replace(/[,|]/g, c => '\\' + c)}`).join(',')
    }
    if (sizelimit && sizelimit > 0) {
        searchParams._count = sizelimit
    }

    const searchResults = []
    await Promise.all(resourceTypes.map(async resourceType => {
        try {
            const { matches = [], includes = [] } = await addressBook.search({
                resourceType,
                searchParams: {
                    ...searchParams,
                    ...(resourceType === 'Organization' ? { _include: 'Organization:endpoint' } : {}),
                    ...(resourceType === 'Location' ? { _include: 'Location:organization' } : {})
                },
            })

            const resources = [...matches, ...includes]
            for await (const resource of resources) {
                const { resourceType } = resource
                if(resourceType === 'Endpoint') {
                    // Find the Organization resource and add it to the resource object.
                    const endpointReference = `Endpoint/${resource.id}`
                    resource.organization = resources.find((resource = {}) => {
                        const { resourceType, endpoint } = resource
                        return resourceType === 'Organization' && Array.isArray(endpoint) && endpoint.some(ep => ep.reference === endpointReference)
                    })
                } else if(resourceType === 'Location') {
                    // Find the Organization resource and add it to the resource object.
                    const { managingOrganization = {} } = resource
                    const { reference: managingOrganizationReference } = managingOrganization
                    resource.organization = resources.find((resource = {}) => {
                        const { resourceType, id } = resource
                        return resourceType === 'Organization' && managingOrganizationReference === `Organization/${id}`
                    })
                } else if(resourceType === 'Organization') {
                    if(search.mode === 'include') {
                        // These resources are included to get the organization name for locations.
                        continue
                    }
                }

                const mapping = mappings[resourceType]
                if(!mapping) {
                    throw new Error(`No mapping defined for resource type ${resourceType}`)
                }

                const ldapEntry = await mapping.evaluate(resource)
                ldapEntry.dn = ['cn', 'o', 'mail'].map(rdn => {
                    const value = ldapEntry[rdn]
                    if(value) {
                        return `${rdn}="${String(value).replace(/"/g, '\\"')}"`
                    } else {
                        return ''
                    }
                }).filter(Boolean).join(', ')

                // Filter out results without mail
                if(!ldapEntry.mail) {
                    continue
                }

                // Filter based on LDAP filter
                if(!applyFilter(ldapEntry, parsedFilter)) {
                    continue
                }

                searchResults.push(ldapEntry)
            }
        } catch(e) {
            const {message, details} = e
            const code = e.code ?? ExtendedError.INTERNAL_SERVER_ERROR
            if(code === ExtendedError.INTERNAL_SERVER_ERROR) {
                throw e
            } else {
                console.log(e)
                logger.warn(`Error searching ${resourceType}: ${message}${details ? ` (${details})` : ''}`)
            }
        }
    }))

    yield* searchResults
}
