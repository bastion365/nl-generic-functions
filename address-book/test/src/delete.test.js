import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import test from 'node:test'

import fetch from '@bastion365/fetch'

import * as updateClient from './util/update-client.js'

const { ADMIN_DIRECTORY_BASE_URL = '', QUERY_DIRECTORY_BASE_URL = '', LRZA_MOCK_BASE_URL = '' } = process.env

await test('delete', async t => {
    let salt = crypto.randomBytes(3).toString('base64url')
    const start = new Date()

    let adminDirectoryRequestBundle = null,
        adminDirectoryResponseBundle = null
    let lrzaMockResponseBundle = null
    let organization = null,
        location = null,
        healthcareService = null,
        endpoint = null

    await t.test('created in admin directory', async () => {
        adminDirectoryRequestBundle = JSON.parse(
            (await fsp.readFile('data/admin-directory/delete.json', 'utf-8')).replace(/{SALT}/g, salt),
        )

        adminDirectoryResponseBundle = await (
            await fetch('', {
                baseUri: ADMIN_DIRECTORY_BASE_URL + '/',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/fhir+json',
                    Accept: 'application/fhir+json',
                },
                body: JSON.stringify(adminDirectoryRequestBundle),
                throwOnError: true,
                logger: null,
            })
        ).json()
        assert.equal(adminDirectoryResponseBundle.resourceType, 'Bundle')
        assert.equal(adminDirectoryResponseBundle.type, 'transaction-response')
        assert.equal(adminDirectoryResponseBundle.entry.length, adminDirectoryRequestBundle.entry.length)
        assert.equal(adminDirectoryResponseBundle.entry[0].response.status, '201 Created')
    })

    await t.test('created in LRZa mock', async () => {
        const bundle = JSON.parse((await fsp.readFile('data/lrza-mock/delete.json', 'utf-8')).replace(/{SALT}/g, salt))
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

    await t.test('Organization can be found in query directory by name', async () => {
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
                    name: `Test delete ${salt}`,
                }),
                throwOnError: true,
                logger: null,
            })
        ).json()
        const matches = entry.filter(e => e.search?.mode === 'match')
        assert.strictEqual(matches.length, 1, 'Should find one matching organization')
        organization = matches[0].resource
    })

    await t.test('Location can be found in query directory by name', async () => {
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
                    name: `Test delete ${salt}`,
                }),
                throwOnError: true,
                logger: null,
            })
        ).json()
        const matches = entry.filter(e => e.search?.mode === 'match')
        assert.strictEqual(matches.length, 1, 'Should find one matching location')
        location = matches[0].resource
    })

    await t.test('HealthcareService can be found in query directory by name', async () => {
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
                    name: `Test delete ${salt}`,
                }),
                throwOnError: true,
                logger: null,
            })
        ).json()
        const matches = entry.filter(e => e.search?.mode === 'match')
        assert.strictEqual(matches.length, 1, 'Should find one matching healthcare service')
        healthcareService = matches[0].resource
    })

    await t.test('Endpoint can be found in query directory by name', async () => {
        const { entry = [] } = await (
            await fetch(`Endpoint`, {
                baseUri: QUERY_DIRECTORY_BASE_URL + '/',
                method: 'GET',
                headers: {
                    Accept: 'application/fhir+json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    Pragma: 'no-cache',
                    Expires: '0',
                },
                query: Object.entries({
                    name: `Test delete ${salt}`,
                }),
                throwOnError: true,
                logger: null,
            })
        ).json()
        const matches = entry.filter(e => e.search?.mode === 'match')
        assert.strictEqual(matches.length, 1, 'Should find one matching endpoint')
        endpoint = matches[0].resource
    })

    await t.test('Delete Location in admin directory', async () => {
        const [, id] = adminDirectoryResponseBundle.entry
            .find(e => e.response.location.startsWith('Location/'))
            .response.location.split('/', 3)
        await fetch(`Location/${id}`, {
            baseUri: ADMIN_DIRECTORY_BASE_URL + '/',
            throwOnError: true,
            method: 'DELETE',
            headers: {
                Accept: 'application/fhir+json',
            },
        })
    })

    await t.test('Delete HealthcareService in admin directory', async () => {
        const [, id] = adminDirectoryResponseBundle.entry
            .find(e => e.response.location.startsWith('HealthcareService/'))
            .response.location.split('/', 3)
        await fetch(`HealthcareService/${id}`, {
            baseUri: ADMIN_DIRECTORY_BASE_URL + '/',
            throwOnError: true,
            method: 'DELETE',
            headers: {
                Accept: 'application/fhir+json',
            },
        })
    })

    await t.test('Delete Endpoint in admin directory', async () => {
        // Pull the Endpoint from Organization.endpoint.
        const [, organizationId] = adminDirectoryResponseBundle.entry
            .find(e => e.response.location.startsWith('Organization/'))
            .response.location.split('/', 3)
        const organization = adminDirectoryRequestBundle.entry.find(
            e => e.resource.resourceType === 'Organization',
        ).resource
        organization.id = organizationId
        organization.endpoint = []
        await fetch(`Organization/${organizationId}`, {
            baseUri: ADMIN_DIRECTORY_BASE_URL + '/',
            throwOnError: true,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/fhir+json',
                Accept: 'application/fhir+json',
            },
            body: JSON.stringify(organization),
        })

        // Delete the Endpoint resource.
        const [, id] = adminDirectoryResponseBundle.entry
            .find(e => e.response.location.startsWith('Endpoint/'))
            .response.location.split('/', 3)
        await fetch(`Endpoint/${id}`, {
            baseUri: ADMIN_DIRECTORY_BASE_URL + '/',
            throwOnError: true,
            method: 'DELETE',
            headers: {
                Accept: 'application/fhir+json',
            },
        })
    })

    await t.test('run update client', async () => {
        const exitCode = await updateClient.run('--since', start.toISOString())
        assert.equal(exitCode, 0, 'Update process should exit with code 0')
    })

    await t.test('Organization can still be found in query directory by name', async () => {
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
                    name: `Test delete ${salt}`,
                }),
                throwOnError: true,
                logger: null,
            })
        ).json()
        const matches = entry.filter(e => e.search?.mode === 'match')
        assert.strictEqual(matches.length, 1, 'Should find one matching organization')
        organization = matches[0].resource
    })

    await t.test('Location can no longer be found in query directory by name', async () => {
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
                    name: `Test delete ${salt}`,
                }),
                throwOnError: true,
                logger: null,
            })
        ).json()
        const matches = entry.filter(e => e.search?.mode === 'match')
        assert.strictEqual(matches.length, 0, 'Should not find a matching location')
    })

    await t.test('HealthcareService can no longer be found in query directory by name', async () => {
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
                    name: `Test delete ${salt}`,
                }),
                throwOnError: true,
                logger: null,
            })
        ).json()
        const matches = entry.filter(e => e.search?.mode === 'match')
        assert.strictEqual(matches.length, 0, 'Should not find a matching healthcare service')
    })

    await t.test('Endpoint can no longer be found in query directory by name', async () => {
        const { entry = [] } = await (
            await fetch(`Endpoint`, {
                baseUri: QUERY_DIRECTORY_BASE_URL + '/',
                method: 'GET',
                headers: {
                    Accept: 'application/fhir+json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    Pragma: 'no-cache',
                    Expires: '0',
                },
                query: Object.entries({
                    name: `Test delete ${salt}`,
                }),
                throwOnError: true,
                logger: null,
            })
        ).json()
        const matches = entry.filter(e => e.search?.mode === 'match')
        assert.strictEqual(matches.length, 0, 'Should not find a matching endpoint')
    })

    await t.test('Delete Organization in LRZa mock', async () => {
        const [, id] = lrzaMockResponseBundle.entry
            .find(e => e.response.location.startsWith('Organization/'))
            .response.location.split('/', 3)
        const res = await fetch(`Organization/${id}`, {
            baseUri: LRZA_MOCK_BASE_URL + '/',
            throwOnError: true,
            method: 'DELETE',
            headers: {
                Accept: 'application/fhir+json',
            },
        })
    })

    await t.test('run update client', async () => {
        const exitCode = await updateClient.run('--since', start.toISOString())
        assert.equal(exitCode, 0, 'Update process should exit with code 0')
    })

    await t.test('Organization can no longer be found in query directory by name', async () => {
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
                    name: `Test delete ${salt}`,
                }),
                throwOnError: true,
                logger: null,
            })
        ).json()
        const matches = entry.filter(e => e.search?.mode === 'match')
        assert.strictEqual(matches.length, 0, 'Should not find a matching organization')
    })
})
