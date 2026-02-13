import path from 'node:path'
import url from 'node:url'

import { ExtendedError, Logger } from '@bastion365/oplog'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'

import AddressRoutes from './address/index.js'
import OrganizationRoutes from './organization/index.js'
import PatientRoutes from './patient/index.js'
import TransferRoutes from './transfer/index.js'

const __dirname = url.fileURLToPath(path.dirname(import.meta.url))

const logger = Logger('app')

const app = Fastify()

app.register(import('@fastify/formbody'))
app.register(AddressRoutes, { prefix: '/address' })
app.register(PatientRoutes, { prefix: '/patient' })
app.register(OrganizationRoutes, { prefix: '/organization' })
app.register(TransferRoutes, { prefix: '/transfer' })
app.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/', // serve index.html at /
})

app.setErrorHandler((error, request, reply) => {
    const code = Number(error.code) || 500
    let message, details
    if (code === 500) {
        message = 'Internal Server Error'
        logger.error(error.stack)
    } else {
        message = error.message || String(error)
        details = error.details
        logger.warn(message)
    }

    reply.code(code)
    reply.header('Content-Type', 'application/json')
    reply.send({ code, message, details })
})

app.listen({ port: 8080, host: '0.0.0.0' }, () => {
    logger.info(`Server listening on http://0.0.0.0:8080`)
})
