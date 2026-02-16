import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import test from 'node:test'

import fetch from '@bastion365/fetch'

import * as updateClient from './util/update-client.js'

const { ADMIN_DIRECTORY_BASE_URL = '', QUERY_DIRECTORY_BASE_URL = '', LRZA_MOCK_BASE_URL = '' } = process.env

await test('full', async t => {
    let salt = crypto.randomBytes(3).toString('base64url')
    const start = new Date()

    let adminDirectoryResponseBundle = null
    let lrzaMockResponseBundle = null
    let organization = null,
        subOrganization = null,
        location = null,
        healthcareService = null,
        practitionerRole = null,
        practitioner = null,
        endpoint = null

    await t.test('created in admin directory', async () => {
        const bundle = JSON.parse(
            (await fsp.readFile('data/admin-directory/full.json', 'utf-8')).replace(/{SALT}/g, salt),
        )

        adminDirectoryResponseBundle = await (
            await fetch('', {
                baseUri: ADMIN_DIRECTORY_BASE_URL + '/',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/fhir+json',
                    Accept: 'application/fhir+json',
                },
                body: JSON.stringify(bundle),
                throwOnError: true,
                logger: null,
            })
        ).json()
        assert.equal(adminDirectoryResponseBundle.resourceType, 'Bundle')
        assert.equal(adminDirectoryResponseBundle.type, 'transaction-response')
        assert.equal(adminDirectoryResponseBundle.entry.length, bundle.entry.length)
        assert.equal(adminDirectoryResponseBundle.entry[0].response.status, '201 Created')
    })

    await t.test('created in LRZa mock', async () => {
        const bundle = JSON.parse((await fsp.readFile('data/lrza-mock/full.json', 'utf-8')).replace(/{SALT}/g, salt))
        lrzaMockResponseBundle = await (
            await fetch('', {
                baseUri: LRZA_MOCK_BASE_URL + '/',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/fhir+json',
                    Accept: 'application/fhir+json',
                },
                body: JSON.stringify(bundle),
                throwOnError: true,
                logger: null,
            })
        ).json()
        assert.equal(lrzaMockResponseBundle.resourceType, 'Bundle')
        assert.equal(lrzaMockResponseBundle.type, 'transaction-response')
        assert.equal(lrzaMockResponseBundle.entry.length, bundle.entry.length)
        assert.equal(lrzaMockResponseBundle.entry[0].response.status, '201 Created')
    })

    await t.test('run update client', async () => {
        const exitCode = await updateClient.run('--since', start.toISOString())
        assert.equal(exitCode, 0, 'Update process should exit with code 0')
    })

    await t.test('Organization can be found in query directory by URA-number', async () => {
        const { entry = [] } = await (
            await fetch(`Organization`, {
                baseUri: QUERY_DIRECTORY_BASE_URL + '/',
                method: 'GET',
                headers: {
                    Accept: 'application/fhir+json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    Pragma: 'no-cache',
                    Expires: '0',
                },
                query: Object.entries({
                    identifier: `000000003-full-${salt}`,
                }),
                throwOnError: true,
                logger: null,
            })
        ).json()
        const matches = entry.filter(e => e.search?.mode === 'match')
        assert.strictEqual(matches.length, 1, 'Should find one matching organization')
        organization = matches[0].resource
    })

    await t.test('Sub-organization can be found in query directory', async () => {
        const { entry = [] } = await (
            await fetch(`Organization`, {
                baseUri: QUERY_DIRECTORY_BASE_URL + '/',
                method: 'GET',
                headers: {
                    Accept: 'application/fhir+json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    Pragma: 'no-cache',
                    Expires: '0',
                },
                query: Object.entries({
                    partof: `Organization/${organization.id}`,
                }),
                throwOnError: true,
                logger: null,
            })
        ).json()
        const matches = entry.filter(e => e.search?.mode === 'match')
        assert.strictEqual(matches.length, 1, 'Should find one matching organization')
        subOrganization = matches[0].resource
    })

    await t.test('Location can be found in query directory', async () => {
        const { entry = [] } = await (
            await fetch(`Location`, {
                baseUri: QUERY_DIRECTORY_BASE_URL + '/',
                method: 'GET',
                headers: {
                    Accept: 'application/fhir+json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    Pragma: 'no-cache',
                    Expires: '0',
                },
                query: Object.entries({
                    organization: `Organization/${organization.id}`,
                }),
                throwOnError: true,
                logger: null,
            })
        ).json()
        const matches = entry.filter(e => e.search?.mode === 'match')
        assert.strictEqual(matches.length, 1, 'Should find one matching location')
        location = matches[0].resource
        assert.strictEqual(location.name, 'Teststraat', 'Location has correct name')
    })

    await t.test('HealthcareService can be found in query directory', async () => {
        const { entry = [] } = await (
            await fetch(`HealthcareService`, {
                baseUri: QUERY_DIRECTORY_BASE_URL + '/',
                method: 'GET',
                headers: {
                    Accept: 'application/fhir+json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    Pragma: 'no-cache',
                    Expires: '0',
                },
                query: Object.entries({
                    organization: `Organization/${subOrganization.id}`,
                }),
                throwOnError: true,
                logger: null,
            })
        ).json()
        const matches = entry.filter(e => e.search?.mode === 'match')
        assert.strictEqual(matches.length, 1, 'Should find one matching healthcare service')
        healthcareService = matches[0].resource
        assert.strictEqual(healthcareService.name, 'Cardiology Service', 'HealthcareService has correct name')
    })

    await t.test('PractitionerRole can be found in query directory', async () => {
        const { entry = [] } = await (
            await fetch(`PractitionerRole`, {
                baseUri: QUERY_DIRECTORY_BASE_URL + '/',
                method: 'GET',
                headers: {
                    Accept: 'application/fhir+json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    Pragma: 'no-cache',
                    Expires: '0',
                },
                query: Object.entries({
                    organization: `Organization/${subOrganization.id}`,
                }),
                throwOnError: true,
                logger: null,
            })
        ).json()
        const matches = entry.filter(e => e.resource.resourceType === 'PractitionerRole' && e.search?.mode === 'match')
        assert.strictEqual(matches.length, 1, 'Should find one matching practitioner role')
        practitionerRole = matches[0].resource
    })

    await t.test('Practitioner can be found in query directory', async () => {
        const { entry = [] } = await (
            await fetch(`Practitioner`, {
                baseUri: QUERY_DIRECTORY_BASE_URL + '/',
                method: 'GET',
                headers: {
                    Accept: 'application/fhir+json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    Pragma: 'no-cache',
                    Expires: '0',
                },
                query: Object.entries({
                    _id: practitionerRole.practitioner.reference.replace('Practitioner/', ''),
                }),
                throwOnError: true,
                logger: null,
            })
        ).json()
        const matches = entry.filter(e => e.search?.mode === 'match')
        assert.strictEqual(matches.length, 1, 'Should find one matching practitioner')
        practitioner = matches[0].resource
        assert.strictEqual(practitioner.name[0].family, 'Doe', 'Practitioner has correct family name')
    })

    await t.test('Endpoint can be retrieved in query directory', async () => {
        assert(organization.endpoint?.[0]?.reference, 'Organization has a literal endpoint reference')

        endpoint = await (
            await fetch(organization.endpoint[0].reference, {
                baseUri: QUERY_DIRECTORY_BASE_URL + '/',
                method: 'GET',
                headers: {
                    Accept: 'application/fhir+json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    Pragma: 'no-cache',
                    Expires: '0',
                },
                throwOnError: true,
                logger: null,
            })
        ).json()
        assert.strictEqual(endpoint.name, 'DICOM WADO-RS endpoint')
    })
})
