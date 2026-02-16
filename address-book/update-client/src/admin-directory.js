import FhirClient from '@bastion365/fhir-client'
import { ExtendedError, Logger } from '@bastion365/oplog'

import { getOrganization } from './common.js'

const logger = Logger('Administration Directory')

const _ = Symbol('private')

class AdminDirectory {
    constructor({ baseUri } = {}) {
        const client = new FhirClient({
            baseUri,
            logger,
        })

        this[_] = { baseUri, client }
    }

    /**
     * Get the resources for an organization by URA.
     * @param {string} options.ura The URA of the organization.
     * @param {string} options.name The name of the organization. This will overwrite the name in the admin directory.
     * @returns {Promise<Array>} The resources for the organization.
     */
    async getOrganization({ura = '', name = ''} = {}) {
        const { client } = this[_]

        return await getOrganization({ client, logger, ura, name })
    }

    async getResource({ resourceType = '', id = '' } = {}) {
        if (!resourceType) {
            throw new TypeError('resourceType is required')
        }
        if (!id) {
            throw new TypeError('id is required')
        }

        const { client } = this[_]
        return await client.read({ resourceType, id })
    }

    async updates({ since = 0 } = {}) {
        const { client } = this[_]
        const updates = []
        const resourceTypes = ['Organization', 'Endpoint', 'Location', 'PractitionerRole', 'Practitioner', 'HealthcareService']
        for(const resourceType of resourceTypes) {
            updates.push(...(await client.history({
                resourceType,
                since: new Date(since).toISOString(),
            })).reverse())
        }
        return updates
    }
}

export default AdminDirectory
