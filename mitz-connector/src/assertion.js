import crypto from 'node:crypto'

import { create } from 'xmlbuilder2'
import { SignedXml } from 'xml-crypto'

async function createAssertion({
    organizationUri,
    cert,
    key,
    mandated = null,
    provider,
    role,
    providerInstitution,
    healthcareFacilityTypeCode,
    purposeOfUse,
    validity = 10 * 60 * 1000, // 10 minutes
} = {}) {
    for (const [paramName, value] of Object.entries({
        organizationUri,
        provider,
        role,
        providerInstitution,
        healthcareFacilityTypeCode,
    })) {
        if (!value) {
            throw new TypeError(`${paramName} is required`)
        }
    }

    const now = new Date()
    const issueInstant = now.toISOString()
    const notOnOrAfter = new Date(+now + validity).toISOString()
    const assertionId = `_${crypto.randomBytes(16).toString('base64url')}`

    const assertionObj = {
        'saml2:Assertion': {
            '@xmlns:saml2': 'urn:oasis:names:tc:SAML:2.0:assertion',
            '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
            '@xmlns:xs': 'http://www.w3.org/2001/XMLSchema',
            '@ID': assertionId,
            '@Version': '2.0',
            '@IssueInstant': issueInstant,

            'saml2:Issuer': organizationUri,

            'saml2:Subject': {
                'saml2:SubjectConfirmation': {
                    '@Method': 'urn:oasis:names:tc:SAML:2.0:cm:bearer',
                },
            },

            'saml2:Conditions': {
                '@NotBefore': issueInstant,
                '@NotOnOrAfter': notOnOrAfter,
                'saml2:AudienceRestriction': {
                    'saml2:Audience': 'urn:oid:2.16.840.1.113883.2.4.3.111.2.1',
                },
            },

            'saml2:AuthnStatement': {
                '@AuthnInstant': issueInstant,
                'saml2:AuthnContext': {
                    'saml2:AuthnContextClassRef': 'urn:oasis:names:tc:SAML:2.0:ac:classes:X509',
                },
            },

            'saml2:AttributeStatement': {
                'saml2:Attribute': [
                    {
                        '@Name': 'urn:ihe:iti:xua:2017:subject:provider-identifier',
                        'saml2:AttributeValue': {
                            id: hl7v3II(provider),
                        },
                    },

                    ...(mandated
                        ? [
                              {
                                  '@Name': 'urn:nl:otv:names:tc:1.0:subject:mandated',
                                  'saml2:AttributeValue': {
                                      id: hl7v3II(mandated),
                                  },
                              },
                          ]
                        : []),

                    {
                        '@Name': 'urn:oasis:names:tc:xacml:2.0:subject:role',
                        'saml2:AttributeValue': {
                            Role: hl7v3CE(role),
                        },
                    },

                    {
                        '@Name': 'urn:nl:otv:names:tc:1.0:subject:provider-institution',
                        'saml2:AttributeValue': {
                            id: hl7v3II(providerInstitution),
                        },
                    },

                    {
                        '@Name': 'urn:nl:otv:names:tc:1.0:subject:consulting-healthcare-facility-type-code',
                        'saml2:AttributeValue': {
                            'consulting-facility-type-code': hl7v3CV(healthcareFacilityTypeCode),
                        },
                    },

                    {
                        '@Name': 'urn:oasis:names:tc:xspa:1.0:subject:purposeofuse',
                        'saml2:AttributeValue': {
                            PurposeOfUse: hl7v3CE(purposeOfUse),
                        },
                    },
                ],
            },
        },
    }

    const unsignedXml = create(assertionObj).end({ headless: true, prettyPrint: false })
    if(!cert && !key) {
        return unsignedXml
    }

    const sig = new SignedXml({
        idMode: 'wssecurity',
        privateKey: key,
    })

    sig.addReference({
        // xpath: "//*[@ID='" + assertionId + "']",
        xpath: "/*",
        digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
        transforms: [
            'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
            'http://www.w3.org/2001/10/xml-exc-c14n#',
        ],
    })
    sig.canonicalizationAlgorithm = 'http://www.w3.org/2001/10/xml-exc-c14n#'
    sig.signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'

    sig.signingKey = key
    sig.publicCert = cert
    sig.getKeyInfoContent = () =>
        `<ds:X509Data xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:X509Certificate>${normalizeCert(cert)}</ds:X509Certificate></ds:X509Data>`

    sig.computeSignature(unsignedXml)

    const signedXml = sig.getSignedXml()

    return signedXml
}

function hl7v3CE({ code, codeSystem, codeSystemName, displayName }) {
    return {
        '@xmlns': 'urn:hl7-org:v3',
        '@xsi:type': 'CE',
        ...Object.fromEntries(
            Object.entries({ code, codeSystem, codeSystemName, displayName })
                .map(([k, v]) => ((v ?? null) !== null ? [`@${k}`, v] : null))
                .filter(Boolean),
        ),
    }
}

function hl7v3CV({ code, codeSystem, displayName }) {
    return {
        '@xmlns': 'urn:hl7-org:v3',
        '@xsi:type': 'CV',
        ...Object.fromEntries(
            Object.entries({ code, codeSystem, displayName })
                .map(([k, v]) => ((v ?? null) !== null ? [`@${k}`, v] : null))
                .filter(Boolean),
        ),
    }
}

function hl7v3II({ root, extension, assigningAuthorityName }) {
    return {
        '@xmlns': 'urn:hl7-org:v3',
        '@xsi:type': 'II',
        ...Object.fromEntries(
            Object.entries({ root, extension, assigningAuthorityName })
                .map(([k, v]) => ((v ?? null) !== null ? [`@${k}`, v] : null))
                .filter(Boolean),
        ),
    }
}

function normalizeCert(pemOrDer) {
    if(Buffer.isBuffer(pemOrDer)) {
        return pemOrDer.toString('base64')
    } else {
        const [leaf, ...intermediates] = pemOrDer.split(/(?=-----BEGIN)/g)
        return leaf.replace(/-----BEGIN CERTIFICATE-----/g, '')
            .replace(/-----END CERTIFICATE-----/g, '')
            .replace(/\s+/g, '')
    }
}

export default createAssertion
