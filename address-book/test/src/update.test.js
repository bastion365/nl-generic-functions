import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import test from 'node:test'

import fetch from '@bastion365/fetch'

import * as updateClient from './util/update-client.js'

const { ADMIN_DIRECTORY_BASE_URL = '', QUERY_DIRECTORY_BASE_URL = '', LRZA_MOCK_BASE_URL = '' } = process.env

await test('update', async t => {
    let salt = crypto.randomBytes(3).toString('base64url')
    let start = new Date()

    let adminDirectoryResponseBundle = null
    let lrzaMockResponseBundle = null
    let resource = null

    await t.test('created in admin directory', async () => {
        const bundle = JSON.parse((await fsp.readFile('data/admin-directory/update.json', 'utf-8')).replace(/{SALT}/g, salt))

        adminDirectoryResponseBundle = await (
            await fetch('', {
                baseUri: ADMIN_DIRECTORY_BASE_URL + '/',
                throwOnError: true,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/fhir+json',
                    Accept: 'application/fhir+json',
                },
                body: JSON.stringify(bundle),
            })
        ).json()
        assert.equal(adminDirectoryResponseBundle.resourceType, 'Bundle')
        assert.equal(adminDirectoryResponseBundle.type, 'transaction-response')
        assert.equal(adminDirectoryResponseBundle.entry.length, bundle.entry.length)
        assert.equal(adminDirectoryResponseBundle.entry[0].response.status, '201 Created')
    })

    await t.test('created in LRZa mock', async () => {
        const bundle = JSON.parse((await fsp.readFile('data/lrza-mock/update.json', 'utf-8')).replace(/{SALT}/g, salt))
        lrzaMockResponseBundle = await (
            await fetch('', {
                baseUri: LRZA_MOCK_BASE_URL + '/',
                throwOnError: true,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/fhir+json',
                    Accept: 'application/fhir+json',
                },
                body: JSON.stringify(bundle),
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

    start = new Date()

    await t.test('can be found in query directory by URA-number', async () => {
        const { entry = [] } = await (
            await fetch(`Organization`, {
                baseUri: QUERY_DIRECTORY_BASE_URL + '/',
                throwOnError: true,
                method: 'GET',
                headers: {
                    Accept: 'application/fhir+json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    Pragma: 'no-cache',
                    Expires: '0',
                },
                query: Object.entries({
                    identifier: `000000002-update-${salt}`,
                }),
            })
        ).json()
        const matches = entry
            .filter(e => e.search?.mode === 'match')
            .sort((a, b) => {
                return b.resource.meta?.lastUpdated.localeCompare(a.resource.meta?.lastUpdated)
            })
        assert.strictEqual(matches.length, 1, 'Should find one matching organization')
        resource = matches[0].resource
        assert.equal(resource.name, 'Organization 2')
    })

    await t.test('updated in admin directory', async () => {
        const [, id] = adminDirectoryResponseBundle.entry[0].response.location.split('/', 3)
        const resource = await (await fetch(`Organization/${id}`, {
            baseUri: ADMIN_DIRECTORY_BASE_URL + '/',
            throwOnError: true,
            method: 'GET',
            headers: {
                Accept: 'application/fhir+json',
            },
        })).json()
        resource.alias ??= []
        resource.alias.push('Added Alias')
        await fetch(`Organization/${resource.id}`, {
            baseUri: ADMIN_DIRECTORY_BASE_URL + '/',
            throwOnError: true,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/fhir+json',
                Accept: 'application/fhir+json',
            },
            body: JSON.stringify(resource),
        })
    })

    await t.test('updated in LRZa mock', async () => {
       const [, id] = lrzaMockResponseBundle.entry[0].response.location.split('/', 3)
       const resource = await (await fetch(`Organization/${id}`, {
            baseUri: LRZA_MOCK_BASE_URL + '/',
            throwOnError: true,
            method: 'GET',
            headers: {
                Accept: 'application/fhir+json',
            },
        })).json()
        resource.name = 'Organization 2 (updated)'
        await fetch(`Organization/${resource.id}`, {
            baseUri: LRZA_MOCK_BASE_URL + '/',
            throwOnError: true,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/fhir+json',
                Accept: 'application/fhir+json',
            },
            body: JSON.stringify(resource),
        })
    })

    await t.test('run update client', async () => {
        const exitCode = await updateClient.run('--since', start.toISOString())
        assert.equal(exitCode, 0, 'Update process should exit with code 0')
    })

    await t.test('can still be found in query directory by URA-number', async () => {
        const { entry = [] } = await (
            await fetch(`Organization`, {
                baseUri: QUERY_DIRECTORY_BASE_URL + '/',
                throwOnError: true,
                method: 'GET',
                headers: {
                    Accept: 'application/fhir+json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    Pragma: 'no-cache',
                    Expires: '0',
                },
                query: Object.entries({
                    identifier: `000000002-update-${salt}`,
                }),
            })
        ).json()
        const matches = entry
            .filter(e => e.search?.mode === 'match')
            .sort((a, b) => {
                return b.resource.meta?.lastUpdated.localeCompare(a.resource.meta?.lastUpdated)
            })

        assert.strictEqual(matches.length, 1, 'Should find one matching organization')
        resource = matches[0].resource
    })

    await t.test('update from admin directory is processed', async () => {
        assert(resource?.alias?.includes('Added Alias'), 'Alias added in admin directory should be present')
    })

    await t.test('update from LRZa mock is processed', async () => {
        assert.equal(resource?.name, 'Organization 2 (updated)', 'Name updated in LRZa mock should be present')
    })
})
