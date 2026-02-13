/**
 * Extract FHIR search parameters from LDAP filter.
 * @param {Object} filter Filter as parsed using `parseSearchFilter()`.
 * @returns { names: string[]|undefined, resourceTypes: string[]|undefined } Object with the folllowing properties:
 * - names: Array of name parts, or undefined if no name filter is present.
 * - resourceTypes: Array of FHIR resource types inferred from the filter, or undefined if there is no objectClass
 *   filter.
 */
function filterToFhir(filter = {}) {
    const [operation] = Object.keys(filter)
    let hasObjectClassFilter = false
    let names, resourceTypes
    if (['AND', 'OR'].includes(operation)) {
        const subfilters = filter[operation] ?? []
        for (const subfilter of subfilters) {
            const subresult = filterToFhir(subfilter)
            if(subresult.names) {
                names ??= []
                names.push(...subresult.names)
            }
            if (subresult.resourceTypes) {
                if (operation === 'AND') {
                    resourceTypes ??= ['Organization', 'Location']
                    resourceTypes = resourceTypes.filter(rt => subresult.resourceTypes.includes(rt))
                } else {
                    resourceTypes ??= []
                    resourceTypes.push(...subresult.resourceTypes)
                }
            }
        }
        names = names?.filter((v, i, a) => a.indexOf(v) === i)
        resourceTypes = resourceTypes?.filter((v, i, a) => a.indexOf(v) === i)
    } else if (['EQ', 'LIKE', 'APPROX'].includes(operation)) {
        const subfilter = filter[operation] ?? {}
        const [attribute] = Object.keys(subfilter)
        if (['cn', 'sn', 'givenName', 'o'].includes(attribute)) {
            const value = subfilter[attribute]
            const parts = value.split('*').filter(Boolean)
            names = parts
        } else if (['objectClass'].includes(attribute)) {
            const [, value] = subfilter[attribute].match(/^\*?(.*?)\*?$/)
            if (value) {
                resourceTypes ??= []
                hasObjectClassFilter = true
                if (
                    [
                        'top',
                        'uidObject',
                        'organization',
                        'HCRegulatedOrganization',
                        'inetOrgRecipient',
                        'namedObject',
                    ].includes(value)
                ) {
                    resourceTypes.push('Organization', 'Location')
                }
            }
        }
    } // LE, GE, NOT, undefined

    return { names, resourceTypes }
}

export default filterToFhir
