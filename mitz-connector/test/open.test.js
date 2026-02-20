import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import test from 'node:test'

import MitzConnector from '@bastion365/mitz-connector'
import config from 'config'

const connector = config.get('connector')
const patient = config.get('patient')
const consultingHealthcareProvider = config.get('consultingHealthcareProvider')

const cert = await fsp.readFile(new URL('../cert/client.crt', import.meta.url), 'utf-8')
const key = await fsp.readFile(new URL('../cert/client.key', import.meta.url), 'utf-8')
const ca = await fsp.readFile(new URL('../cert/ca.pem', import.meta.url), 'utf-8')

await test('open vraag', async t => {
    const mc = new MitzConnector({
        ...connector,
        cert,
        key,
        ca,
    })
    const result = await mc.open({
        ...patient,
        provider: MitzConnector.UZI(consultingHealthcareProvider.uzi),
        role: MitzConnector.ROLE(consultingHealthcareProvider.role),
        providerInstitution: MitzConnector.URA(consultingHealthcareProvider.ura),
        healthcareFacilityTypeCode: MitzConnector.ORG_ROLE(consultingHealthcareProvider.healthcareFacilityTypeCode),
    })

    assert(Array.isArray(result), 'Result should be an array')
})
