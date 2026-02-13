import { once } from 'node:events'
import fs from 'node:fs'
import net from 'node:net'
import readline from 'node:readline/promises'

import { ExtendedError, Logger } from '@bastion365/oplog'

import { ERROR_CODE_TO_LDAP_STATUS, LDAP_STATUS } from './constants.js'
import operations from './operations/index.js'
import { formatEntry, formatResult } from './utils/formatResponse.js'

const OPS = ['add', 'bind', 'compare', 'delete', 'modify', 'search', 'unbind']
const SOCKET_PATH = '/home/node/slapd-sock/slapd.sock'
const logger = Logger('app.js')

try {
    if (fs.existsSync(SOCKET_PATH)) {
        fs.unlinkSync(SOCKET_PATH)
        logger.info('Removed stale socket:', SOCKET_PATH)
    }
} catch (error) {
    logger.error('Error removing socket:', error)
}

const parseMessage = lines =>
    lines.reduce((acc, line) => {
        let [key, value = ''] = line.split(':')
        key &&= key.trim().toLowerCase()
        value = value.trim()

        if (key && !value && OPS.includes(key)) {
            acc.operation = key
        } else {
            acc[key] = value
        }

        return acc
    }, {})

const sendResponse = async socket => {
    try {
        const message = parseMessage(socket.messageLines)
        const { operation, connid, msgid, peername, timelimit } = message

        logger.info(`Received ${operation} from ${peername} (${connid}:${msgid})`)

        if (operation === 'unbind') {
            return void socket.end()
        }

        if (timelimit) {
            socket.setTimeout(Number(timelimit) * 1000)
        }

        const processMessage = operations[operation]
        const results = processMessage(message)

        if (results && typeof results[Symbol.asyncIterator] === 'function') {
            const limit = Number(message.sizelimit) || Infinity
            let count = 0
            for await (const entry of results) {
                const response = formatEntry(entry)
                if (!socket.write(response)) await once(socket, 'drain')
                if (++count >= limit) {
                    break
                }
            }
            logger.info(`Returned ${count} entries`)
        } else {
            await results
        }
        const response = formatResult()
        if (!socket.write(response)) await once(socket, 'drain')
    } catch (e) {
        const { code } = e
        const ldapStatus = ERROR_CODE_TO_LDAP_STATUS[code] ?? LDAP_STATUS.OPERATIONS_ERROR
        let info
        if (ldapStatus === LDAP_STATUS.OPERATIONS_ERROR) {
            logger.error(`Error processing message: ${e.stack}`)
        } else {
            logger.warn(e.message)
            info = e.message
        }

        socket.write(formatResult({ code: ldapStatus, info }))
    } finally {
        socket.messageLines.length = 0

        if (!socket.destroyed) {
            socket.end()
        }
    }
}

const onLine = socket => async line => {
    if (!line) return void sendResponse(socket)
    socket.messageLines.push(line)
}

const server = net.createServer(socket => {
    const onTimeout = () => {
        logger.warn('Socket idle timeout; closing connection')
        socket.write(formatResult({ code: LDAP_STATUS.TIMELIMIT_EXCEEDED }))
        socket.end()
    }

    logger.debug('New connection')
    socket.on('error', logger.error)
    socket.on('timeout', onTimeout)
    socket.on('end', () => logger.debug('Peer closed connection'))
    socket.on('close', () => logger.debug('Socket closed'))
    socket.messageLines = []
    socket.setKeepAlive(true)

    const rl = readline.createInterface({ input: socket })
    rl.on('error', logger.error)
    rl.on('line', onLine(socket))
})

server.listen(SOCKET_PATH, () => logger.info(`Listening for connections on ${SOCKET_PATH}`))
