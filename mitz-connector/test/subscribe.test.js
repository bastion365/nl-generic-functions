import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import test from 'node:test'

import MitzConnector from '@bastion365/mitz-connector'

import config from 'config'

const connector = config.get('connector')
const patient = config.get('patient')
const resourceOwner = config.get('resourceOwner')

const cert = await fsp.readFile(new URL('../cert/client.crt', import.meta.url), 'utf-8')
const key = await fsp.readFile(new URL('../cert/client.key', import.meta.url), 'utf-8')
const ca = await fsp.readFile(new URL('../cert/ca.pem', import.meta.url), 'utf-8')

await test('abonneren', async t => {
    const mc = new MitzConnector({
        ...connector,
        cert,
        key,
        ca,
    })
    const result = await mc.subscribe({
        ...patient,
        providerInstitution: MitzConnector.URA(resourceOwner.ura),
        healthcareFacilityTypeCode: MitzConnector.ORG_ROLE(resourceOwner.healthcareFacilityTypeCode),
        gatewayUri: resourceOwner.gatewayUri,
        sourceSystemUri: resourceOwner.sourceSystemUri,
        notificationUrl: resourceOwner.notificationUrl,
    })

    assert(result.id && typeof result.id === 'string', 'Result should have a non-empty subscription id')
})
