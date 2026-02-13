import fsp from 'node:fs/promises'

import { ExtendedError, Logger } from '@bastion365/oplog'
import minimist from 'minimist'

import LRZa from './lrza.js'
import AdminDirectory from './admin-directory.js'
import QueryDirectory from './query-directory.js'

const logger = Logger('update-client')

const { LRZA_BASE_URL = '', QUERY_DIRECTORY_BASE_URL = '' } = process.env

const args = minimist(process.argv.slice(2))
const full = args.full || args.f || false

if (full && args.since) {
    logger.error('Cannot use both --full and --since options together')
    process.exit(1)
}

if (!LRZA_BASE_URL) {
    logger.error('No LRZA_BASE_URL configured')
    process.exit(1)
}
logger.info(`Using LRZa at ${LRZA_BASE_URL}`)

if (!QUERY_DIRECTORY_BASE_URL) {
    logger.error('No QUERY_DIRECTORY_BASE_URL configured')
    process.exit(1)
}
logger.info(`Using Query Directory at ${QUERY_DIRECTORY_BASE_URL}`)

let lastUpdate = null
let adminDirectories = null
try {
    const lrza = new LRZa({
        baseUri: LRZA_BASE_URL,
    })

    const queryDirectory = new QueryDirectory({
        baseUri: QUERY_DIRECTORY_BASE_URL,
    })

    try {
        lastUpdate = JSON.parse(await fsp.readFile('/var/status/last-update.json', 'utf-8'))
    } catch (e) {
        if (e.code !== 'ENOENT') {
            throw e
        }
        lastUpdate = {}
    }

    try {
        adminDirectories = JSON.parse(await fsp.readFile('/var/status/admin-directories.json', 'utf-8'))
    } catch (e) {
        if (e.code !== 'ENOENT') {
            throw e
        }
        adminDirectories = []
    }

    if (full) {
        const newAdminDirectories = []
        const remainingUras = new Set(await queryDirectory.allUras())

        // Request all Organizations with their Endpoints from LRZa.
        for await (const { ura, name, adminDirectoryEndpoint } of lrza.allOrganizations()) {
            await queryDirectory.deleteOrganization({ ura })
            remainingUras.delete(ura)

            const baseUri = adminDirectoryEndpoint.address
            const adminDirectory = new AdminDirectory({
                baseUri,
            })
            if (!newAdminDirectories.includes(baseUri)) {
                newAdminDirectories.push(baseUri)
            }

            let resources
            try {
                resources = await adminDirectory.getOrganization({ ura, name })
            } catch (e) {
                if ((e.code || ExtendedError.INTERNAL_SERVER_ERROR) === ExtendedError.INTERNAL_SERVER_ERROR) {
                    throw e
                }
                logger.error(
                    `Failed to get organization ${ura} from admin directory at ${baseUri}: ${e.message}${
                        e.details ? '\n' + e.details : ''
                    }`,
                )
                continue
            }
            if (resources.length !== 0) {
                await queryDirectory.addResources({ resources, source: adminDirectoryEndpoint.address })
            }
        }

        const now = new Date().toISOString()
        lastUpdate = {
            lrza: now,
        }
        for (const adminDirectory of newAdminDirectories) {
            lastUpdate[adminDirectory] = now
        }
        adminDirectories = newAdminDirectories

        // Delete Organizations that are no longer present in LRZa.
        for (const ura of remainingUras) {
            await queryDirectory.deleteOrganization({ ura })
        }
    } else {
        // Request updates from LRZa since last update.
        if (!(args.since || lastUpdate.lrza)) {
            logger.error('No last updated time found, please run with --full option or provide --since parameter')
            process.exit(1)
        }

        for await (const { ura, name, adminDirectoryEndpoint } of lrza.updatedOrganizations({
            since: Date.parse(args.since || lastUpdate.lrza),
        })) {
            logger.info(`Delete organization with URA ${ura}`)
            await queryDirectory.deleteOrganization({ ura })
            if (adminDirectoryEndpoint) {
                const baseUri = adminDirectoryEndpoint.address
                const adminDirectory = new AdminDirectory({
                    baseUri,
                })
                if (!adminDirectories.includes(baseUri)) {
                    adminDirectories.push(baseUri)
                }

                logger.info(`Add organization with URA ${ura}`)
                let resources
                try {
                    resources = await adminDirectory.getOrganization({ ura, name })
                } catch (e) {
                    if ((e.code || ExtendedError.INTERNAL_SERVER_ERROR) === ExtendedError.INTERNAL_SERVER_ERROR) {
                        throw e
                    }
                    logger.error(
                        `Failed to get organization ${ura} from admin directory at ${baseUri}: ${e.message}${
                            e.details ? '\n' + e.details : ''
                        }`,
                    )
                    continue
                }
                if (resources.length !== 0) {
                    await queryDirectory.addResources({ resources, source: adminDirectoryEndpoint.address })
                }
            }
        }

        for (const baseUri of adminDirectories) {
            const adminDirectory = new AdminDirectory({
                baseUri,
            })

            let updates
            try {
                updates = await adminDirectory.updates({
                    since: Date.parse(args.since || lastUpdate[baseUri]) || 0,
                })
            } catch (e) {
                if ((e.code || ExtendedError.INTERNAL_SERVER_ERROR) === ExtendedError.INTERNAL_SERVER_ERROR) {
                    throw e
                }
                logger.error(
                    `Failed to get updates from admin directory at ${baseUri}: ${e.message}${
                        e.details ? '\n' + e.details : ''
                    }`,
                )
                continue
            }

            await queryDirectory.applyUpdates({ updates, source: baseUri, adminDirectory, lrza })
            lastUpdate[baseUri] = new Date().toISOString()
        }
    }
} catch (e) {
    const code = e.code || ExtendedError.INTERNAL_SERVER_ERROR
    if (code === ExtendedError.INTERNAL_SERVER_ERROR) {
        logger.error(e.stack)
    } else {
        logger.warn(e.message)
    }
    if (e.details) {
        logger.warn(e.details)
    }
} finally {
    if (lastUpdate) {
        await fsp.writeFile('/var/status/last-update.json', JSON.stringify(lastUpdate, null, 2), 'utf-8')
    }
    if (adminDirectories) {
        await fsp.writeFile('/var/status/admin-directories.json', JSON.stringify(adminDirectories, null, 2), 'utf-8')
    }

    setImmediate(process.exit, 0)
}
