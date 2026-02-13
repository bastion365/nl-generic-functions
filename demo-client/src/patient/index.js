import FhirClient from '@bastion365/fhir-client'
import { ExtendedError, Logger } from '@bastion365/oplog'
import escapeHtml from 'escape-html'

const { EHR_BASE_URL = '' } = process.env

const logger = Logger('address')

const patientDirectory = new FhirClient({
    baseUri: EHR_BASE_URL,
    logger,
})

function routes(fastify, options, done) {
    fastify.post('/search', async (req, reply) => {
        const { identifier = '', given = '', family = '', birthdate = '' } = req.body

        const searchParams = {
            identifier,
            given,
            family,
            birthdate,
        }
        const { matches = [], includes = [] } = await patientDirectory.search({
            resourceType: 'Patient',
            searchParams,
        })
        const results = matches.map(resource => transform(resource))

        let html = '<ul class="results">'
        for (const r of results) {
            html += renderItem(r)
        }
        html += '</ul>'

        return reply.type('text/html').send(html)
    })

    done()
}

function renderItem(r) {
    const name = escapeHtml(r.name)
    const email = r.email ? escapeHtml(r.email) : null
    const birthDate = r.birthDate ? escapeHtml(r.birthDate) : null

    return `
    <li class="item">
      <div class="line1">
        <span class="type-icon">👤</span>
        <span class="name">${name || 'anonymous'}</span>
      </div>
      ${
          birthDate
              ? `<div class="line2">
               <span class="email">Birth date: ${birthDate}</span>
             </div>`
              : ''
      }
      ${
          email
              ? `<div class="line2">
               <span class="email-icon">✉️</span>
               <span class="email">${email}</span>
             </div>`
              : ''
      }
      <div class="line2">
        <span class="email"><a hx-get="transfer/${encodeURIComponent(r.id)}" hx-target="#content" hx-swap="innerHTML">Transfer</a></span>
      </div>
    </li>
  `
}

const transform = (resource = {}) => {
    const { id, birthDate, name: names = [], telecom = [] } = resource
    const email = telecom.find(t => t.system === 'email' && t.use !== 'old')?.value
    names.sort((a, b) => {
        const useOrder = { offical: 1, usual: 2 }
        const aOrder = useOrder[a.use] || 99
        const bOrder = useOrder[b.use] || 99
        return aOrder - bOrder
    })
    const name = names
        .map(({ text = '', family = '', given = [], prefix = [], suffix = [] }) => {
            return text || [...prefix, ...given, family, ...suffix].filter(Boolean).join(' ')
        })
        .filter(Boolean)[0]
    return {
        id,
        name,
        birthDate,
        email,
    }
}

export default routes
