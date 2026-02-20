import assert from 'node:assert'
import fsp from 'node:fs/promises'
import test from 'node:test'

import MitzConnector from '@bastion365/mitz-connector'

const cert = await fsp.readFile(new URL('../cert/client.crt', import.meta.url), 'utf-8')
const key = await fsp.readFile(new URL('../cert/client.key', import.meta.url), 'utf-8')
const ca = await fsp.readFile(new URL('../cert/ca.pem', import.meta.url), 'utf-8')

import config from 'config'

const connector = config.get('connector')
const patient = config.get('patient')
const consultingHealthcareProvider = config.get('consultingHealthcareProvider')
const resourceOwner = config.get('resourceOwner')

await test('gesloten vraag', async t => {
    const mc = new MitzConnector({
        ...connector,
        cert,
        key,
        ca,
    })
    const result = await mc.closed({
        ...patient,
        consultingHealthcareProvider: {
            provider: MitzConnector.UZI(consultingHealthcareProvider.uzi),
            role: MitzConnector.ROLE(consultingHealthcareProvider.role),
            providerInstitution: MitzConnector.URA(consultingHealthcareProvider.ura),
            healthcareFacilityTypeCode: MitzConnector.ORG_ROLE(consultingHealthcareProvider.healthcareFacilityTypeCode),
        },
        resourceOwner: {
            providerInstitution: MitzConnector.URA(resourceOwner.ura),
            healthcareFacilityTypeCode: MitzConnector.ORG_ROLE(resourceOwner.healthcareFacilityTypeCode),
        },
        dataCategory: [
            MitzConnector.DATA_CATEGORY('GGC002'),
        ],
    })

    assert(['Permit', 'Deny'].includes(result?.decision), 'Decision should be either Permit or Deny')
})
