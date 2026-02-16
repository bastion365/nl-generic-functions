import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import test from 'node:test'

import fetch from '@bastion365/fetch'

import * as updateClient from './util/update-client.js'

const { ADMIN_DIRECTORY_BASE_URL = '', QUERY_DIRECTORY_BASE_URL = '', LRZA_MOCK_BASE_URL = '' } = process.env

await test('simple', async t => {
    let salt = crypto.randomBytes(3).toString('base64url')
    const start = new Date()

    let adminDirectoryResponseBundle = null
    let lrzaMockResponseBundle = null

    await t.test('created in admin directory', async () => {
        const bundle = JSON.parse((await fsp.readFile('data/admin-directory/simple.json', 'utf-8')).replace(/{SALT}/g, salt))

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
        const bundle = JSON.parse((await fsp.readFile('data/lrza-mock/simple.json', 'utf-8')).replace(/{SALT}/g, salt))
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

    await t.test('can be found in query directory by URA-number', async () => {
        const {entry = []} = await (
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
                    identifier: `000000001-simple-${salt}`,
                }),
                throwOnError: true,
                logger: null,
            })
        ).json()
        const matches = entry.filter(e => e.search?.mode === 'match')
        assert.strictEqual(matches.length, 1, 'Should find one matching organization')
    })

    await t.test('can be found in query directory by name', async () => {
        const {entry = []} = await (
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
                    name: 'Organization 1',
                }),
                throwOnError: true,
                logger: null,
            })
        ).json()
        const matches = entry.filter(e => e.search?.mode === 'match')
        assert(matches.length >= 1, 'Should find at least one matching organization')
    })
})
