import FhirClient from '@bastion365/fhir-client'
import { ExtendedError, Logger } from '@bastion365/oplog'
import escapeHtml from 'escape-html'

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

function routes(fastify, options, done) {
    fastify.post('/search', async (req, reply) => {
        const { name = '', directoryType = '' } = req.body ?? {}

        const addressBook = directoryType === 'admin' ? adminDirectory : queryDirectory

        const resourceTypes = ['Organization', 'Location']
        const results = [].concat(
            ...(await Promise.all(
                resourceTypes.map(async resourceType => {
                    const searchParams = {
                        name,
                    }
                    if (resourceType === 'Organization') {
                        searchParams._include = 'Organization:endpoint'
                    } else if (resourceType === 'Location') {
                        searchParams._include = 'Location:organization'
                    }
                    const { matches = [], includes = [] } = await addressBook.search({
                        resourceType,
                        searchParams,
                    })
                    return matches.flatMap(resource => transform[resourceType](resource, includes))
                }),
            )),
        ).filter((v, i, a) => a.findIndex(t => t.organizationId === v.organizationId && t.resourceType === v.resourceType && t.name === v.name) === i)

        let html
        if(results.length) {
            html = '<ul class="results">'
            for (const r of results) {
                html += renderItem(r, { directoryType })
            }
            html += '</ul>'
        } else {
            html = '<p>No results</p>'
        }

        return reply.type('text/html').send(html)
    })

    done()
}

const icons = {
    Organization: '🏢',
    Location: '📍',
    Endpoint: '🔌',
}

function renderItem(r, { directoryType = '' } = {}) {
    const typeIcon = icons[r.resourceType] || '❓'
    const name = escapeHtml(r.name)
    const email = r.email ? escapeHtml(r.email) : null

    return `
    <li class="item">
      <div class="line1">
        <span class="type-icon">${typeIcon}</span>
        <a class="name" hx-get="organization/${encodeURIComponent(r.organizationId || '')}/${directoryType === 'admin' ? 'edit' : 'view'}">${name}</a>
      </div>
      ${
          email
              ? `<div class="line2">
               <span class="email-icon">✉️</span>
               <span class="email">${email}</span>
             </div>`
              : ''
      }
    </li>
  `
}

const transform = {
    Organization: (resource = {}, includes = []) => {
        const { id: organizationId, resourceType, name: organizationName = '', telecom = [] } = resource
        const email = telecom.find(t => t.system === 'email' && t.use !== 'old')?.value
        return [
            {
                organizationId,
                resourceType,
                name: organizationName,
                email,
            },
            ...includes
                .filter(r => r.resourceType === 'Endpoint')
                .map(endpoint => {
                    const { address = '', connectionType = {}, name: endpointName = '', resourceType } = endpoint
                    const name = [organizationName, endpointName || connectionType.display].filter(Boolean).join(' | ')
                    const email = address.startsWith('mailto:') ? address.slice(7) : undefined
                    if(!email) {
                        return null
                    }
                    return {
                        organizationId,
                        resourceType,
                        name,
                        email,
                    }
                }).filter(Boolean),
        ]
    },
    Location: (resource = {}, includes = []) => {
        const { resourceType, managingOrganization, name: locationName = '', telecom = [] } = resource
        const [, organizationId] = managingOrganization?.reference?.split('/', 3) ?? []
        const organization = includes.find(r => r.resourceType === 'Organization' && r.id === organizationId) || {}
        const { name: organizationName = '' } = organization
        const name = [organizationName, locationName].filter(Boolean).join(' | ')
        const email = telecom.find(t => t.system === 'email' && t.use !== 'old')?.value
        return [
            {
                organizationId,
                resourceType,
                name,
                email,
            },
        ]
    },
}

export default routes
