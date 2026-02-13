/**
 * Get the resources for an organization by URA.
 * @param {Object} options.client The FHIR client to use.
 * @param {Object} options.logger The logger object.
 * @param {string} options.ura The URA of the organization.
 * @param {string} options.name The name of the organization. This will overwrite the name in the admin directory.
 * @returns {Promise<Array>} The resources for the organization.
 */
async function getOrganization({ client = null, logger, ura = '', name = '' } = {}) {
    if (!ura) {
        throw new TypeError('ura is required')
    }

    logger.info(`Get organization with URA ${ura}`)

    const results = await client.search({
        resourceType: 'Organization',
        searchParams: {
            identifier: `http://fhir.nl/fhir/NamingSystem/ura|${ura}`,
            _include: 'Organization:endpoint',
        },
        method: 'GET',
    })

    const organizations = [...results.matches]
    const endpoints = results.includes.filter(r => r.resourceType === 'Endpoint')

    if (organizations.length === 0) {
        return []
    }

    // "The LRZa Administration Directory is authoritative for Organization instances with identifier of system
    // http://fhir.nl/fhir/NamingSystem/ura (URA) and its name. When the healthcare provider's Administration
    // Directory also provides a name value (for an Organization-instance with a URA-identifier), these values
    // should be ignored." (NL Generic Functions IG Care Services Directory)
    for (const organization of organizations) {
        if (name) {
            organization.name = name
        }
        organization.identifier = (organization.identifier ?? []).filter(
            id => id.system !== 'http://fhir.nl/fhir/NamingSystem/ura',
        )
        organization.identifier.push({
            system: 'http://fhir.nl/fhir/NamingSystem/ura',
            value: ura,
        })
    }

    // Request all sub-organizations.
    for (let i = 0; i < organizations.length; i++) {
        const { id } = organizations[i]
        const { matches = [], includes = [] } = await client.search({
            resourceType: 'Organization',
            searchParams: {
                partof: `Organization/${id}`,
                _include: 'Organization:endpoint',
            },
            method: 'GET',
        })
        for (const subOrganization of matches) {
            if (!organizations.find(o => o.id === subOrganization.id)) {
                organizations.push(subOrganization)
            }
        }
        for (const endpoint of includes.filter(r => r.resourceType === 'Endpoint')) {
            if (!endpoints.find(e => e.id === endpoint.id)) {
                endpoints.push(endpoint)
            }
        }
    }

    // Request all locations
    const { matches: locations = [] } = await client.search({
        resourceType: 'Location',
        searchParams: {
            organization: organizations.map(o => `Organization/${o.id}`).join(','),
        },
        method: 'GET',
    })

    // Request all practitioner roles and practitioners
    const { matches: practitionerRoles = [], includes: practitioners = [] } = await client.search({
        resourceType: 'PractitionerRole',
        searchParams: {
            organization: organizations.map(o => `Organization/${o.id}`).join(','),
            _include: 'PractitionerRole:practitioner',
        },
        method: 'GET',
    })

    // Request all healthcare services
    const { matches: healthcareServices = [] } = await client.search({
        resourceType: 'HealthcareService',
        searchParams: {
            organization: organizations.map(o => `Organization/${o.id}`).join(','),
        },
        method: 'GET',
    })

    // Add Endpoints referenced by HealthcareServices
    for(const healthcareService of healthcareServices) {
        for(const { reference = '' } of healthcareService.endpoint ?? []) {
            const [resourceType, id] = reference.split('/')
            if (resourceType === 'Endpoint') {
                if (!endpoints.find(e => e.id === id)) {
                    const endpoint = await client.read({ resourceType, id })
                    endpoints.push(endpoint)
                }
            }
        }
    }

    return [...organizations, ...endpoints, ...locations, ...practitionerRoles, ...practitioners, ...healthcareServices]
}

export {
    getOrganization,
}
