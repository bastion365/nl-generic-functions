import fetch from '@bastion365/fetch'
import xml2js from 'xml2js'
import { DOMParser } from '@xmldom/xmldom'
import xpath from 'xpath'

import createAssertion from './assertion.js'
import * as constants from './constants.js'

const _ = Symbol('private')

class MitzConnector {
    /**
     * Create a new Mitz connector client.
     * @param {string} options.endpoint The endpoint URL of the Mitz service,
     * e.g. "https://tst-api.mijn-mitz.nl/tst-us/mitz/".
     * @param {string} options.organizationUri The URL or urn:oid URI of the organization using this connector.
     * @param {Buffer|string} options.cert Certificate to use for signing the SAML assertions, as a Buffer containing a
     * DER-encoded X.509 certificate, or a PEM-encoded string.
     * @param {Buffer|string} options.key Private key to use for signing the SAML assertions, as a Buffer containing a
     * DER-encoded PKCS#8, or PEM-encoded string.
     * @param {string|string[]|Buffer|Buffer[]} [options.ca] Optional CA certificate(s) to use when validating the Mitz
     * server's TLS certificate.
     */
    constructor({ endpoint, organizationUri = '', cert, key, ca } = {}) {
        this[_] = {
            endpoint,
            organizationUri,
            cert,
            key,
            ca,
        }

        for (const [paramName, value] of Object.entries({
            endpoint,
            organizationUri,
            cert,
            key,
        })) {
            if (!value) {
                throw new TypeError(`${paramName} is required`)
            }
        }
    }

    /**
     * Perform an XACML 3.0 request ("gesloten vraag") to check permission for a given action.
     * @param {string} options.bsn The BSN (Dutch SSN) of the patient.
     * @param {Object} options.resourceOwner Identification of the healthcare provider organization that owns the data.
     * @param {Object} options.consultingHealthcareProvider Identification of the individual healthcare provider making
     * the request. This may include all options for createAssertion().
     * @param {Object[]} options.dataCategory The data category for which access is requested. Defaults to GGC002. When
     * only labresults can be requested, GGC012 should be used. When only medication data can be requested, GGC013
     * should be used.
     * @returns {Promise<Object[]>} An Object with a decision property, with one of the following values:
     * - "Permit"; the request is permitted.
     * - "Deny"; the request should be denied by the resource owner.
     * - "Indeterminate"; evaluation was not possible, e.g. because the provided data was not recognized or incomplete.
     */
    async closed({
        bsn = '',
        resourceOwner = null,
        consultingHealthcareProvider = null,
        purposeOfUse = MitzConnector.TREAT,
        dataCategory = [MitzConnector.DATA_CATEGORY('GGC002')],
    } = {}) {
        const { endpoint, cert, key, ca } = this[_]
        for (const [paramName, value] of Object.entries({
            bsn,
            resourceOwner,
            consultingHealthcareProvider,
        })) {
            if (!value) {
                throw new TypeError(`${paramName} is required`)
            }
        }

        const messageId = `urn:uuid:${crypto.randomUUID()}`
        const url = new URL('geslotenautorisatievraag/xacml3', endpoint)
        const body = new xml2js.Builder({ renderOpts: { pretty: false } }).buildObject({
            'soap:Envelope': {
                $: {
                    'xmlns:soap': 'http://www.w3.org/2003/05/soap-envelope',
                    'xmlns:wsa': 'http://www.w3.org/2005/08/addressing',
                },
                'soap:Header': {
                    'wsa:Action': {
                        $: {
                            'soap:mustUnderstand': '1',
                        },
                        _: 'XACMLAuthorizationDecisionQueryRequest',
                    },
                    'wsa:MessageID': messageId,
                    'wsa:To': {
                        $: {
                            'soap:mustUnderstand': '1',
                        },
                        _: url.toString(),
                    },
                    'wsa:ReplyTo': {
                        'wsa:Address': 'http://www.w3.org/2005/08/addressing/anonymous',
                    },
                },
                'soap:Body': {
                    'xacml-saml:XACMLAuthzDecisionQuery': {
                        $: {
                            'xmlns:xacml-saml': 'urn:oasis:names:tc:xacml:3.0:profile:saml2.0:v2:schema:protocol:wd-14',
                            'xmlns:xacml-context': 'urn:oasis:names:tc:xacml:3.0:core:schema:wd-17',
                            'xmlns:hl7v3': 'urn:hl7-org:v3',
                        },

                        'xacml-context:Request': {
                            $: {
                                ReturnPolicyIdList: 'false',
                                CombinedDecision: 'false',
                            },

                            'xacml-context:Attributes': [
                                // Resource
                                {
                                    $: {
                                        Category: 'urn:oasis:names:tc:xacml:3.0:attribute-category:resource',
                                        'xml:id': 'resource',
                                    },
                                    'xacml-context:Attribute': [
                                        // BSN
                                        {
                                            $: {
                                                AttributeId: 'urn:oasis:names:tc:xacml:2.0:resource:resource-id',
                                                IncludeInResult: 'false',
                                            },
                                            'xacml-context:AttributeValue': {
                                                $: {
                                                    DataType: 'urn:hl7-org:v3#II',
                                                },
                                                'hl7v3:InstanceIdentifier': hl7v3II({
                                                    'root': '2.16.840.1.113883.2.4.6.3',
                                                    'extension': bsn,
                                                }),
                                            },
                                        },

                                        // zorgaanbiedercategoriecode
                                        {
                                            $: {
                                                AttributeId: 'urn:ihe:iti:appc:2016:document-entry:healthcare-facility-type-code',
                                                IncludeInResult: 'false',
                                            },
                                            'xacml-context:AttributeValue': {
                                                $: {
                                                    DataType: 'urn:hl7-org:v3#CV',
                                                },
                                                'hl7v3:CodedValue': hl7v3CV(resourceOwner.healthcareFacilityTypeCode),
                                            },
                                        },

                                        // URA
                                        {
                                            $: {
                                                AttributeId: 'urn:ihe:iti:appc:2016:author-institution:id',
                                                IncludeInResult: 'false',
                                            },
                                            'xacml-context:AttributeValue': {
                                                $: {
                                                    DataType: 'urn:hl7-org:v3#II',
                                                },
                                                'hl7v3:InstanceIdentifier': hl7v3II(resourceOwner.providerInstitution),
                                            },
                                        },
                                    ],
                                },

                                // Action
                                ...(dataCategory.map((category, index) => ({
                                    $: {
                                        Category: 'urn:oasis:names:tc:xacml:3.0:attribute-category:action',
                                        'xml:id': `action${index}`,
                                    },
                                    'xacml-context:Attribute': [
                                        // Gegevenscategorie
                                        {
                                            $: {
                                                AttributeId: 'urn:ihe:iti:appc:2016:document-entry:event-code',
                                                IncludeInResult: 'false',
                                            },
                                            'xacml-context:AttributeValue': {
                                                $: {
                                                    DataType: 'urn:hl7-org:v3#CV',
                                                },
                                                'hl7v3:CodedValue': hl7v3CV(category),
                                            },
                                        },
                                    ],
                                }))),

                                // Subject
                                {
                                    $: {
                                        Category: 'urn:oasis:names:tc:xacml:1.0:subject-category:access-subject',
                                        'xml:id': `subject`,
                                    },
                                    'xacml-context:Attribute': [
                                        // Role
                                        {
                                            $: {
                                                AttributeId: `urn:oasis:names:tc:xacml:2.0:subject:role`,
                                                IncludeInResult: 'false',
                                            },
                                            'xacml-context:AttributeValue': {
                                                $: {
                                                    DataType: 'urn:hl7-org:v3#CV',
                                                },
                                                'hl7v3:CodedValue': hl7v3CV(consultingHealthcareProvider.role),
                                            },
                                        },

                                        // UZI
                                        {
                                            $: {
                                                AttributeId: `urn:ihe:iti:xua:2017:subject:provider-identifier`,
                                                IncludeInResult: 'false',
                                            },
                                            'xacml-context:AttributeValue': {
                                                $: {
                                                    DataType: 'urn:hl7-org:v3#II',
                                                },
                                                'hl7v3:InstanceIdentifier': hl7v3II(consultingHealthcareProvider.provider),
                                            },
                                        },

                                        // URA
                                        {
                                            $: {
                                                AttributeId: `urn:nl:otv:names:tc:1.0:subject:provider-institution`,
                                                IncludeInResult: 'false',
                                            },
                                            'xacml-context:AttributeValue': {
                                                $: {
                                                    DataType: 'urn:hl7-org:v3#II',
                                                },
                                                'hl7v3:InstanceIdentifier': hl7v3II(consultingHealthcareProvider.providerInstitution),
                                            },
                                        },

                                        // zorgaanbiedercategoriecode
                                        {
                                            $: {
                                                AttributeId: 'urn:nl:otv:names:tc:1.0:subject:consulting-healthcare-facility-type-code',
                                                IncludeInResult: 'false',
                                            },
                                            'xacml-context:AttributeValue': {
                                                $: {
                                                    DataType: 'urn:hl7-org:v3#CV',
                                                },
                                                'hl7v3:CodedValue': hl7v3CV(consultingHealthcareProvider.healthcareFacilityTypeCode),
                                            },
                                        },
                                    ],
                                },

                                // Environment
                                {
                                    $: {
                                        Category: 'urn:oasis:names:tc:xacml:3.0:attribute-category:environment',
                                        'xml:id': `environment`,
                                    },
                                    'xacml-context:Attribute': [
                                        // Raadpleegsituatie
                                        {
                                            $: {
                                                AttributeId: 'urn:oasis:names:tc:xspa:1.0:subject:purposeofuse',
                                                IncludeInResult: 'false',
                                            },
                                            'xacml-context:AttributeValue': {
                                                $: {
                                                    DataType: 'urn:hl7-org:v3#CV',
                                                },
                                                'hl7v3:CodedValue': hl7v3CV(purposeOfUse),
                                            },
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                },
            },
        })

        const response = await fetch('geslotenautorisatievraag/xacml3', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/soap+xml; charset=UTF-8',
            },
            body,
            baseUri: endpoint,
            throwOnError: true,
            timeout: 30000,
            cert,
            key,
            ca,
        })

        const responseString = await response.text()
        const doc = new DOMParser().parseFromString(responseString)
        const select = xpath.useNamespaces({
            soap: 'http://www.w3.org/2003/05/soap-envelope',
            wsa: 'http://www.w3.org/2005/08/addressing',
            'xacml-context': 'urn:oasis:names:tc:xacml:3.0:core:schema:wd-17',
        })

        const responseAction = select('string(/soap:Envelope/soap:Header/wsa:Action)', doc)
        if (responseAction !== 'http://schemas.otv.nl/toestemmingsregister/XACMLAuthzDecisionQuery/IGeslotenAutorisatievraagService/XACMLAuthzDecisionQueryResponse') {
            throw new Error(`Response has unexpected action: ${responseAction}`)
        }

        const decision = select('string(/soap:Envelope/soap:Body/xacml-context:Response/xacml-context:Result/xacml-context:Decision)', doc)
        return { decision }
    }

    /**
     * Create a SAML assertion used to authorize requests to Mitz.
     * @param {Object} [options.mandated] Identification of the person requesting the data, in case her or she is
     * mandated by the responsible provider.
     * @param {string} options.mandated.extension Identifier within the identification system.
     * @param {string} options.mandated.root OID of the identification system (e.g. "2.16.528.1.1007.3.1" for
     * UZI-numbers).
     * @param {string} [options.mandated.assigningAuthorityName] The assigning authority name (e.g. "CIBG").
     * @param {Object} options.provider Identification of the individual healthcare provider making the request.
     * @param {string} options.provider.extension Identifier within the identification system.
     * @param {string} options.provider.root OID of the identification system (e.g. "2.16.528.1.1007.3.1" for
     * UZI-numbers).
     * @param {string} [options.provider.assigningAuthorityName] The assigning authority name (e.g. "CIBG").
     * @param {Object} options.role Profession of the provider.
     * @param {string} options.role.code The code representing the profession (e.g. "01.013").
     * @param {string} options.role.codeSystem The code system. Only "2.16.840.1.113883.2.4.15.111" is supported here.
     * @param {string} options.role.codeSystemName The code system name. Only "RoleCodeNL" is supported here.
     * @param {string} options.role.displayName Display name of the profession (e.g. "Arts v. maag-darm-leverziekten").
     * @param {Object} options.providerInstitution Identification of the healthcare provider organization.
     * @param {string} options.providerInstitution.extension Identifier within the identification system.
     * @param {string} options.providerInstitution.root OID of the identification system (only "2.16.528.1.1007.3.3" is
     * supported here).
     * @param {string} [options.providerInstitution.assigningAuthorityName] The assigning authority name.
     * @param {Object} options.healthcareFacilityTypeCode Category of the healthcare provider organization.
     * @param {string} options.healthcareFacilityTypeCode.code The code representing the category (e.g. "V6").
     * @param {string} options.healthcareFacilityTypeCode.codeSystem The code system (only
     * "2.16.840.1.113883.2.4.15.1060" is supported here).
     * @param {string} options.healthcareFacilityTypeCode.displayName Display name of the category (e.g. "Algemeen
     * ziekenhuis").
     * @param {Object} options.purposeOfUse The purpose of use for which the data is requested. Defaults to TREAT.
     * @param {string} options.purposeOfUse.code The code representing the purpose (e.g. "TREAT").
     * @param {string} options.purposeOfUse.codeSystem The code system (only "2.16.840.1.113883.1.11.20448" is
     * supported here).
     * @param {string} options.purposeOfUse.displayName Display name of the purpose (e.g. "treatment").
     * @returns {Promise<Object>} The response from Mitz, parsed into an object.
     */
    async createAssertion({
        signed = true,
        mandated = null,
        provider = null,
        role = null,
        providerInstitution = null,
        healthcareFacilityTypeCode = null,
        purposeOfUse = MitzConnector.TREAT,
    } = {}) {
        const { organizationUri, cert, key } = this[_]
        return createAssertion({
            organizationUri,
            cert: signed ? cert : null,
            key: signed ? key : null,
            mandated,
            provider,
            role,
            providerInstitution,
            healthcareFacilityTypeCode,
            purposeOfUse,
        })
    }

    /**
     * Perform a patient location query (IHE XCPD ITI-56; "open vraag").
     * @param {string} options ...include all options for createAssertion().
     * @param {string} options.bsn The BSN (Dutch SSN) of the patient.
     * @returns {Promise<Object[]>} A Promise which resolves to an array of patient location responses. Each entry
     * contains the following properties:
     * - homeCommunityId: The Home Community ID of the responding system.
     * - correspondingPatientId: The patient ID as known in the responding system.
     * - sourceId: The Source ID identifying the source system within the Home Community.
     * - authorInstitution: Identification of the institution that authored the data, with 'root' and 'extension' properties.
     * - ura: The UZI-registratienummer of the author institution, if available.
     * An empty array is returned when there is no location found for the given patient, or no permission is granted.
     */
    async open({
        bsn = '',
        mandated = null,
        provider = null,
        role = null,
        providerInstitution = null,
        healthcareFacilityTypeCode = null,
        purposeOfUse = MitzConnector.TREAT,
    } = {}) {
        const { endpoint, cert, key, ca } = this[_]
        for (const [paramName, value] of Object.entries({
            bsn,
        })) {
            if (!value) {
                throw new TypeError(`${paramName} is required`)
            }
        }

        const assertion = await this.createAssertion({
            signed: false,
            mandated,
            provider,
            role,
            providerInstitution,
            healthcareFacilityTypeCode,
            purposeOfUse,
        })
        const parsedAssertion = await xml2js.parseStringPromise(assertion)

        const messageId = `urn:uuid:${crypto.randomUUID()}`
        const url = new URL('openautorisatievraag', endpoint)
        const body = new xml2js.Builder({ renderOpts: { pretty: false } }).buildObject({
            'soap:Envelope': {
                $: {
                    'xmlns:soap': 'http://www.w3.org/2003/05/soap-envelope',
                    'xmlns:wsa': 'http://www.w3.org/2005/08/addressing',
                },
                'soap:Header': {
                    'wsa:Action': {
                        $: {
                            'soap:mustUnderstand': '1',
                        },
                        _: 'urn:ihe:iti:2009:PatientLocationQuery',
                    },
                    'wsa:MessageID': messageId,
                    'wsa:To': {
                        $: {
                            'soap:mustUnderstand': '1',
                        },
                        _: url.toString(),
                    },
                    'wsa:ReplyTo': {
                        'wsa:Address': 'http://www.w3.org/2005/08/addressing/anonymous',
                    },
                    'wsse:Security': {
                        $: {
                            'xmlns:wsse':
                                'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd',
                            'xmlns:wsu':
                                'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd',
                            'soap:mustUnderstand': '1',
                        },
                        ...parsedAssertion,
                    },
                },
                'soap:Body': {
                    PatientLocationQueryRequest: {
                        $: {
                            xmlns: 'urn:ihe:iti:xcpd:2009',
                        },
                        RequestedPatientId: {
                            $: {
                                extension: bsn,
                                root: '2.16.840.1.113883.2.4.6.3', // Nederlandse patient-id namespace
                                assigningAuthorityName: 'NLMINBIZA', // verplicht volgens Mitz handleiding
                            },
                        },
                    },
                },
            },
        })
        const response = await fetch('openautorisatievraag', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/soap+xml; charset=UTF-8',
            },
            body,
            baseUri: endpoint,
            throwOnError: true,
            timeout: 30000,
            cert,
            key,
            ca,
        })

        const responseString = await response.text()

        const doc = new DOMParser().parseFromString(responseString)
        const select = xpath.useNamespaces({
            soap: 'http://www.w3.org/2003/05/soap-envelope',
            wsa: 'http://www.w3.org/2005/08/addressing',
            xcpd: 'urn:ihe:iti:xcpd:2009',
        })

        const responseAction = select('string(/soap:Envelope/soap:Header/wsa:Action)', doc)
        if (responseAction !== 'urn:ihe:iti:2009:PatientLocationQueryResponse') {
            throw new Error(`Response has unexpected action: ${responseAction}`)
        }
        const relatedMessageId = select('string(/soap:Envelope/soap:Header/wsa:RelatesTo)', doc)
        if (relatedMessageId !== messageId) {
            throw new Error(`Response relates to unexpected message ID: ${relatedMessageId}`)
        }

        const patientLocationResponses = select(
            '/soap:Envelope/soap:Body/xcpd:PatientLocationQueryResponse/xcpd:PatientLocationResponse',
            doc,
        )

        const result = patientLocationResponses.map(plr => {
            const homeCommunityId = select('string(xcpd:HomeCommunityId)', plr)
            const correspondingPatientId = {
                root: select('string(xcpd:CorrespondingPatientId/@root)', plr),
                extension: select('string(xcpd:CorrespondingPatientId/@extension)', plr),
                assigningAuthorityName: select('string(xcpd:CorrespondingPatientId/@assigningAuthorityName)', plr),
            }
            const sourceId = select('string(xcpd:SourceId)', plr)
            const authorInstitution = {
                root: select('string(xcpd:author-institution/@root)', plr),
                extension: select('string(xcpd:author-institution/@extension)', plr),
            }
            const ura = authorInstitution.root === '2.16.528.1.1007.3.3' ? authorInstitution.extension : null

            return {
                homeCommunityId,
                correspondingPatientId,
                sourceId,
                authorInstitution,
                ura,
            }
        })

        return result
    }

    /**
     * Create a Subscription in Mitz. This will cause Mitz to:
     * - register the provider as a potential data holder for the given patient
     * - send notifications when the patient consent changes
     * @param {string} options ...include all options for createAssertion().
     * @param {string} options.bsn The BSN (Dutch SSN) of the patient.
     * @param {string} options.birthDate The patient's birth date. This value is (conditionally) required when the
     * Mitz-connector has a verified birth date.
     * @param {string} options.gatewayUri Identifier of the exchange system (US). Must be a URI using the urn:oid
     * scheme. The value corresponds with homeCommunityId in the response to open().
     * @param {string} options.sourceSystemUri Identifier of the source system. Must be a URI using the urn:oid scheme.
     * The value corresponds with sourceId in the response to open().
     * @param {string} options.notificationUrl The URL to which notifications should be sent.
     * @returns {Promise<Object>} An object containing an `id` property which is the Subscription id in Mitz.
     */
    async subscribe({
        bsn = '',
        birthDate = '',
        providerInstitution = null,
        healthcareFacilityTypeCode = null,
        gatewayUri = '',
        sourceSystemUri = '',
        notificationUrl = '',
    } = {}) {
        const { endpoint, cert, key, ca } = this[_]
        for (const [paramName, value] of Object.entries({
            bsn,
            gatewayUri,
            sourceSystemUri,
            notificationUrl,
        })) {
            if (!value) {
                throw new TypeError(`${paramName} is required`)
            }
        }

        const subscription = {
            resourceType: 'Subscription',
            extension: [
                birthDate
                    ? {
                          url: 'http://fhir.nl/StructureDefinition/Patient.birthDate',
                          valueDate: birthDate,
                      }
                    : undefined,
                {
                    url: 'http://fhir.nl/StructureDefinition/GatewaySystem',
                    valueOid: gatewayUri,
                },
                {
                    url: 'http://fhir.nl/StructureDefinition/SourceSystem',
                    valueOid: sourceSystemUri,
                },
            ].filter(Boolean),
            status: 'requested',
            reason: 'OTV',
            criteria: `Consent?_query=otv&patientid=${bsn}&providerid=${providerInstitution.extension}&providertype=${healthcareFacilityTypeCode.code}`,
            channel: {
                type: 'rest-hook',
                endpoint: notificationUrl,
                payload: 'application/fhir+json',
            },
        }

        const response = await fetch('abonnementen/fhir/Subscription', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/fhir+json',
            },
            body: JSON.stringify(subscription),
            baseUri: endpoint,
            throwOnError: true,
            timeout: 30000,
            cert,
            key,
            ca,
        })

        const location = response.headers.get('location') ?? ''
        const [resourceType, id] = location.split('/').slice(-2)

        await response.body.cancel()

        return { id }
    }
}

Object.defineProperty(MitzConnector, 'ORG_ROLE', {
    value: code => ({
        code,
        codeSystem: '2.16.840.1.113883.2.4.15.1060',
        displayName: constants.ORG_ROLE_CODE_NL[code],
    }),
})

Object.defineProperty(MitzConnector, 'ROLE', {
    value: code => ({
        code,
        codeSystem: '2.16.840.1.113883.2.4.15.111',
        codeSystemName: 'RoleCodeNL',
        displayName: constants.ROLE_CODE_NL[code],
    }),
})

Object.defineProperty(MitzConnector, 'TREAT', {
    value: {
        code: 'TREAT',
        codeSystem: '2.16.840.1.113883.1.11.20448',
        displayName: 'treatment',
    },
})

Object.defineProperty(MitzConnector, 'URA', {
    value: extension => ({
        extension,
        root: '2.16.528.1.1007.3.3',
        assigningAuthorityName: 'CIBG',
    }),
})

Object.defineProperty(MitzConnector, 'UZI', {
    value: extension => ({
        extension,
        root: '2.16.528.1.1007.3.1',
        assigningAuthorityName: 'CIBG',
    }),
})

Object.defineProperty(MitzConnector, 'DATA_CATEGORY', {
    value: code => ({
        code,
        codeSystem: '2.16.840.1.113883.2.4.3.111.5.10.1',
        codeSystemName: 'GTZ gegevenscategorie',
        displayName: constants.DATA_CATEGORY[code],
    }),
})

function hl7v3CV({ code, codeSystem, displayName }) {
    return {
        $: Object.fromEntries(
            Object.entries({ code, codeSystem, displayName })
                .filter(([, v]) => v != null),
        ),
    }
}

function hl7v3II({ root, extension, assigningAuthorityName }) {
    return {
        $: Object.fromEntries(
            Object.entries({ root, extension, assigningAuthorityName })
                .filter(([, v]) => v != null),
        ),
    }
}

export default MitzConnector
