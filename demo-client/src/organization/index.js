import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import url from 'node:url'

import FhirClient from '@bastion365/fhir-client'
import { ExtendedError, Logger } from '@bastion365/oplog'
import escapeHtml from 'escape-html'
import Handlebars from 'handlebars'
import jsonata from 'jsonata'

const __dirname = url.fileURLToPath(path.dirname(import.meta.url))

const { ADMIN_DIRECTORY_BASE_URL = '', QUERY_DIRECTORY_BASE_URL = '' } = process.env

const logger = Logger('address')

const adminDirectory = new FhirClient({
    baseUri: ADMIN_DIRECTORY_BASE_URL,
    logger,
})

const queryDirectory = new FhirClient({
    baseUri: QUERY_DIRECTORY_BASE_URL,
    logger,
})

const formTemplate = Handlebars.compile(
    await fs.readFile(path.join(__dirname, '../../templates/organization-form.handlebars'), 'utf-8'),
)
const endpointRowTemplate = Handlebars.compile(
    await fs.readFile(path.join(__dirname, '../../templates/endpoint-row.handlebars'), 'utf-8'),
)
const healthcareServiceRowTemplate = Handlebars.compile(
    await fs.readFile(path.join(__dirname, '../../templates/healthcare-service-row.handlebars'), 'utf-8'),
)
const locationRowTemplate = Handlebars.compile(
    await fs.readFile(path.join(__dirname, '../../templates/location-row.handlebars'), 'utf-8'),
)
const parentOrganizationRowTemplate = Handlebars.compile(
    await fs.readFile(path.join(__dirname, '../../templates/parent-organization-row.handlebars'), 'utf-8'),
)
const parentOrganizationTemplate = Handlebars.compile(
    await fs.readFile(path.join(__dirname, '../../templates/parent-organization.handlebars'), 'utf-8'),
)

Handlebars.registerHelper('selected', (a, b) => (a === b ? 'selected' : ''))

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
    fastify.get('/add', async (req, reply) => {
        const html = formTemplate({
            id: '',
            name: '',
            ura: '',
            type: '',
            email: '',
            endpoints: [],
            locations: [],
            editable: true,
        })
        return reply.type('text/html').send(html)
    })

    fastify.get('/:id/edit', async (req, reply) => {
        const { id } = req.params
        const resources = await getOrganization({ id, addressBook: adminDirectory })
        const data = await mappings['from-fhir'].evaluate(resources)
        data.editable = true
        const html = formTemplate(data)
        return reply.type('text/html').send(html)
    })

    fastify.get('/:id/view', async (req, reply) => {
        const { id } = req.params
        const resources = await getOrganization({ id, addressBook: queryDirectory })
        const data = await mappings['from-fhir'].evaluate(resources)
        data.editable = false
        const html = formTemplate(data)
        return reply.type('text/html').send(html)
    })

    fastify.get('/row/endpoint', async (req, reply) => {
        const html = endpointRowTemplate({})
        return reply.type('text/html').send(html)
    })

    fastify.get('/row/location', async (req, reply) => {
        const html = locationRowTemplate({})
        return reply.type('text/html').send(html)
    })

    fastify.get('/row/healthcare-service', async (req, reply) => {
        const html = healthcareServiceRowTemplate({})
        return reply.type('text/html').send(html)
    })

    fastify.get('/row/endpoint/remove', (_, reply) => reply.send(''))
    fastify.get('/row/location/remove', (_, reply) => reply.send(''))
    fastify.get('/row/healthcare-service/remove', (_, reply) => reply.send(''))

    fastify.post('/save', async (req, reply) => {
        const { body = {} } = req
        const { id, name, ura, type, parent_id: partOf, email } = body

        const endpoints = []
        const locations = []
        const healthcareServices = []

        // Normalize arrays
        const eids = [].concat(body['endpoint_id[]'] || [])
        const enames = [].concat(body['endpoint_name[]'] || [])
        const etypes = [].concat(body['endpoint_type[]'] || [])
        const epayloads = [].concat(body['endpoint_payload[]'] || [])
        const evalues = [].concat(body['endpoint_value[]'] || [])
        const lids = [].concat(body['location_id[]'] || [])
        const lnames = [].concat(body['location_name[]'] || [])
        const lemails = [].concat(body['location_email[]'] || [])
        const laddressline1 = [].concat(body['location_address_line1[]'] || [])
        const laddressline2 = [].concat(body['location_address_line2[]'] || [])
        const lcity = [].concat(body['location_city[]'] || [])
        const lcountry = [].concat(body['location_country[]'] || [])
        const hsids = [].concat(body['healthcare_service_id[]'] || [])
        const hstypes = [].concat(body['healthcare_service_type[]'] || [])
        const hsemails = [].concat(body['healthcare_service_email[]'] || [])

        for (let i = 0; i < Math.max(...[eids, enames, etypes, epayloads, evalues].map(a => a.length)); i++) {
            const obj = Object.fromEntries(
                Object.entries({
                    id: eids[i],
                    name: enames[i],
                    type: etypes[i],
                    payload: epayloads[i],
                    value: evalues[i],
                }).filter(([_, v]) => v),
            )
            if (Object.keys(obj).length > 0) {
                endpoints.push(obj)
            }
        }

        for (
            let i = 0;
            i < Math.max(...[lids, lnames, lemails, laddressline1, laddressline2, lcity, lcountry].map(a => a.length));
            i++
        ) {
            const obj = Object.fromEntries(
                Object.entries({
                    id: lids[i],
                    name: lnames[i],
                    email: lemails[i],
                    addressLine1: laddressline1[i],
                    addressLine2: laddressline2[i],
                    city: lcity[i],
                    country: lcountry[i],
                }).filter(([_, v]) => v),
            )
            if (Object.keys(obj).length > 0) {
                locations.push(obj)
            }
        }

        for (let i = 0; i < Math.max(...[hsids, hstypes, hsemails].map(a => a.length)); i++) {
            const obj = Object.fromEntries(
                Object.entries({
                    id: hsids[i],
                    type: hstypes[i],
                    email: hsemails[i],
                }).filter(([_, v]) => v),
            )
            if (Object.keys(obj).length > 0) {
                healthcareServices.push(obj)
            }
        }

        const resources = await mappings['to-fhir'].evaluate({
            id,
            name,
            ura,
            type,
            partOf,
            email,
            endpoints,
            locations,
            healthcareServices,
        })
        const entry = resources.map(r => ({
            fullUrl: r.id ? `${r.resourceType}/${r.id}` : `urn:uuid:${crypto.randomUUID()}`,
            resource: r,
            request: {
                method: r.id ? 'PUT' : 'POST',
                url: r.id ? `${r.resourceType}/${r.id}` : r.resourceType,
            },
        }))
        const fhirOrganization = entry.find(r => r.resource.resourceType === 'Organization')
        const fhirEndpoints = entry.filter(r => r.resource.resourceType === 'Endpoint')
        const fhirLocations = entry.filter(r => r.resource.resourceType === 'Location')
        const fhirHealthcareServices = entry.filter(r => r.resource.resourceType === 'HealthcareService')
        console.log(2, JSON.stringify(fhirEndpoints[0]))

        fhirOrganization.resource.endpoint = fhirEndpoints.map(e => ({
            reference: e.fullUrl,
        }))

        for (const location of fhirLocations) {
            location.resource.managingOrganization = {
                reference: fhirOrganization.fullUrl,
            }
        }

        for (const healthcareService of fhirHealthcareServices) {
            healthcareService.resource.providedBy = {
                reference: fhirOrganization.fullUrl,
            }
        }

        await adminDirectory.transaction({ entry })

        return reply.type('text/html').send(`<p>Organization saved</p>`)
    })

    fastify.post('/search-parent', async (req, reply) => {
        const { parent_name: name = '' } = req.body ?? {}

        const { matches = [] } = await adminDirectory.search({
            resourceType: 'Organization',
            searchParams: {
                name,
            },
        })
        const results = matches.map(resource => {
            const { id, name } = resource
            return { id, name }
        })

        let html = '<ul class="parent-results">'
        for (const r of results) {
            html += parentOrganizationRowTemplate(r)
        }
        html += '</ul>'

        return reply.type('text/html').send(html)
    })

    fastify.get('/select-parent', async (req, reply) => {
        const { id = '' } = req.query

        let name = ''
        if (id) {
            const organization = await adminDirectory.read({
                resourceType: 'Organization',
                id,
            })
            name = organization.name
        }

        const html = parentOrganizationTemplate({ id, parent_name: name })
        return reply.type('text/html').send(html)
    })

    done()
}

async function getOrganization({ id = '', addressBook } = {}) {
    if (!id) {
        throw new TypeError('id is required')
    }

    const organization = await addressBook.read({
        resourceType: 'Organization',
        id,
    })

    // Request all endpoints
    const endpoints = (
        await Promise.all(
            (organization.endpoint || []).map(async e => {
                const endpointId = e.reference?.split('/')[1] || ''
                if (!endpointId) return null
                return await addressBook.read({
                    resourceType: 'Endpoint',
                    id: endpointId,
                })
            }),
        )
    ).filter(Boolean)

    // Request all locations
    const { matches: locations = [] } = await addressBook.search({
        resourceType: 'Location',
        searchParams: {
            organization: `Organization/${organization.id}`,
        },
    })

    // Request all healthcare services
    const { matches: healthcareServices = [] } = await addressBook.search({
        resourceType: 'HealthcareService',
        searchParams: {
            organization: `Organization/${organization.id}`,
        },
    })

    return [organization, ...endpoints, ...locations, ...healthcareServices]
}

export default routes
