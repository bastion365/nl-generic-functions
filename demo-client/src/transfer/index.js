import fs from 'node:fs/promises'
import path from 'node:path'
import url from 'node:url'

import FhirClient from '@bastion365/fhir-client'
import { ExtendedError, Logger } from '@bastion365/oplog'
import Handlebars from 'handlebars'
import jsonata from 'jsonata'

const __dirname = url.fileURLToPath(path.dirname(import.meta.url))

const { EHR_BASE_URL = '', QUERY_DIRECTORY_BASE_URL = '' } = process.env

const logger = Logger('transfer')

const ehr = new FhirClient({
    baseUri: EHR_BASE_URL,
    logger,
})

const queryDirectory = new FhirClient({
    baseUri: QUERY_DIRECTORY_BASE_URL,
    logger,
})

const files = (await fs.readdir(path.join(__dirname, '../../templates/transfer'))).filter(file =>
    file.endsWith('.handlebars'),
)
const handlebars = Handlebars.create()
handlebars.registerHelper('eq', function (a, b) {
    return a === b
})
handlebars.registerHelper('length', function (arr) {
    return arr?.length || 0
})
for (const file of files) {
    const templateName = path.basename(file, '.handlebars')
    const content = await fs.readFile(path.join(__dirname, '../../templates/transfer', file), 'utf-8')
    handlebars.registerPartial(templateName, content)
}
const templates = {}
for (const file of files) {
    const templateName = path.basename(file, '.handlebars')
    const content = await fs.readFile(path.join(__dirname, '../../templates/transfer', file), 'utf-8')
    templates[templateName] = handlebars.compile(content)
}

const mappings = Object.fromEntries(
    await Promise.all(
        ['from-fhir', 'to-fhir'].map(async name => {
            const definition = (await fs.readFile(path.join(__dirname, `../../mapping/${name}.jsonata`))).toString()
            const mapping = jsonata(definition)
            return [name, mapping]
        }),
    ),
)

function routes(fastify, options, done) {
    fastify.get('/:patientId', async (req, reply) => {
        const { patientId } = req.params

        const html = templates.form({ step: 'organization', patientId })
        return reply.type('text/html').send(html)
    })

    fastify.post('/', async (req, reply) => {
        const {body = {}} = req
        let { action, organizationId, organizationName, healthcareServiceId, locationSelected } = body

        if (action === 'back-to-organization') {
            organizationId = undefined
            healthcareServiceId = undefined
        } else if (action === 'back-to-healthcare-service') {
            healthcareServiceId = undefined
        } else if (action === 'back-to-location') {
            locationSelected = undefined
        }

        let step,
            organizationResults = [],
            healthcareServicesResults = [],
            locationResults = [],
            endpointResults = [],
            emailAddress
        if (!organizationId) {
            step = 'organization'

            if (organizationName) {
                const { matches = [] } = await queryDirectory.search({
                    resourceType: 'Organization',
                    searchParams: {
                        name: organizationName,
                    },
                })
                organizationResults = matches.map(resource => {
                    const { id, name } = resource
                    return { id, name }
                })
            }
        } else if(!healthcareServiceId) {
            step = 'healthcare-service'

            const { matches = [] } = await queryDirectory.search({
                resourceType: 'HealthcareService',
                searchParams: {
                    organization: `Organization/${organizationId}`,
                },
            })

            healthcareServicesResults = (await mappings['from-fhir'].evaluate(matches)).healthcareServices
        } else if(!locationSelected) {
            step = 'location'

            const healthcareService = await queryDirectory.read({
                resourceType: 'HealthcareService',
                id: healthcareServiceId,
            })
            const locations = (await Promise.all((healthcareService.location ?? []).map(async ({reference}) => {
                if(!(reference && reference.startsWith('Location/'))) {
                    return null
                }
                const location =  await queryDirectory.read({
                    resourceType: 'Location',
                    id: reference.replace('Location/', ''),
                })
                return location
            }))).filter(Boolean)
            locationResults = (await mappings['from-fhir'].evaluate(locations)).locations
        } else {
            step = 'endpoint'

            const organization = await queryDirectory.read({
                resourceType: 'Organization',
                id: organizationId,
            })
            const healthcareService = await queryDirectory.read({
                resourceType: 'HealthcareService',
                id: healthcareServiceId,
            })
            const endpoints = (await Promise.all((healthcareService.endpoint ?? []).map(async ({reference}) => {
                if(!(reference && reference.startsWith('Endpoint/'))) {
                    return null
                }
                const endpoint =  await queryDirectory.read({
                    resourceType: 'Endpoint',
                    id: reference.replace('Endpoint/', ''),
                })
                return endpoint
            }))).filter(Boolean)

            const evaluated = await mappings['from-fhir'].evaluate([organization, healthcareService, ...endpoints])
            endpointResults = evaluated.endpoints
            emailAddress = evaluated.healthcareServices[0]?.email || evaluated.email
        }

        const html = templates.form({
            ...body,
            step,
            organizationResults,
            healthcareServicesResults,
            locationResults,
            endpointResults,
            emailAddress,
        })
        return reply.type('text/html').send(html)
    })

    fastify.post('/search-organization', async (req, reply) => {
        const { organizationName = '' } = req.body ?? {}

        const { matches = [] } = await queryDirectory.search({
            resourceType: 'Organization',
            searchParams: {
                name: organizationName,
            },
        })
        const results = matches.map(resource => {
            const { id, name } = resource
            return { id, name }
        })

        let html = '<ul class="organization-results">'
        if (results.length) {
            for (const r of results) {
                html += templates['search-organization-result'](r)
            }
        } else {
            html += 'No results'
        }
        html += '</ul>'

        return reply.type('text/html').send(html)
    })

    done()
}

export default routes
