<a name="MitzConnector"></a>

## MitzConnector
**Kind**: global class  

* [MitzConnector](#MitzConnector)
    * [new MitzConnector()](#new_MitzConnector_new)
    * [.closed()](#MitzConnector+closed) ⇒ <code>Promise.&lt;Array.&lt;Object&gt;&gt;</code>
    * [.createAssertion()](#MitzConnector+createAssertion) ⇒ <code>Promise.&lt;Object&gt;</code>
    * [.open(options)](#MitzConnector+open) ⇒ <code>Promise.&lt;Array.&lt;Object&gt;&gt;</code>
    * [.subscribe(options)](#MitzConnector+subscribe) ⇒ <code>Promise.&lt;Object&gt;</code>

<a name="new_MitzConnector_new"></a>

### new MitzConnector()
Create a new Mitz connector client.


| Param | Type | Description |
| --- | --- | --- |
| options.endpoint | <code>string</code> | The endpoint URL of the Mitz service, e.g. "https://tst-api.mijn-mitz.nl/tst-us/mitz/". |
| options.organizationUri | <code>string</code> | The URL or urn:oid URI of the organization using this connector. |
| options.cert | <code>Buffer</code> \| <code>string</code> | Certificate to use for signing the SAML assertions, as a Buffer containing a DER-encoded X.509 certificate, or a PEM-encoded string. |
| options.key | <code>Buffer</code> \| <code>string</code> | Private key to use for signing the SAML assertions, as a Buffer containing a DER-encoded PKCS#8, or PEM-encoded string. |
| [options.ca] | <code>string</code> \| <code>Array.&lt;string&gt;</code> \| <code>Buffer</code> \| <code>Array.&lt;Buffer&gt;</code> | Optional CA certificate(s) to use when validating the Mitz server's TLS certificate. |

<a name="MitzConnector+closed"></a>

### mitzConnector.closed() ⇒ <code>Promise.&lt;Array.&lt;Object&gt;&gt;</code>
Perform an XACML 3.0 request ("gesloten vraag") to check permission for a given action.

**Kind**: instance method of [<code>MitzConnector</code>](#MitzConnector)  
**Returns**: <code>Promise.&lt;Array.&lt;Object&gt;&gt;</code> - An Object with a decision property, with one of the following values:
- "Permit"; the request is permitted.
- "Deny"; the request should be denied by the resource owner.
- "Indeterminate"; evaluation was not possible, e.g. because the provided data was not recognized or incomplete.  

| Param | Type | Description |
| --- | --- | --- |
| options.bsn | <code>string</code> | The BSN (Dutch SSN) of the patient. |
| options.resourceOwner | <code>Object</code> | Identification of the healthcare provider organization that owns the data. |
| options.consultingHealthcareProvider | <code>Object</code> | Identification of the individual healthcare provider making the request. This may include all options for createAssertion(). |
| options.dataCategory | <code>Array.&lt;Object&gt;</code> | The data category for which access is requested. Defaults to GGC002. When only labresults can be requested, GGC012 should be used. When only medication data can be requested, GGC013 should be used. |

<a name="MitzConnector+createAssertion"></a>

### mitzConnector.createAssertion() ⇒ <code>Promise.&lt;Object&gt;</code>
Create a SAML assertion used to authorize requests to Mitz.

**Kind**: instance method of [<code>MitzConnector</code>](#MitzConnector)  
**Returns**: <code>Promise.&lt;Object&gt;</code> - The response from Mitz, parsed into an object.  

| Param | Type | Description |
| --- | --- | --- |
| [options.mandated] | <code>Object</code> | Identification of the person requesting the data, in case her or she is mandated by the responsible provider. |
| options.mandated.extension | <code>string</code> | Identifier within the identification system. |
| options.mandated.root | <code>string</code> | OID of the identification system (e.g. "2.16.528.1.1007.3.1" for UZI-numbers). |
| [options.mandated.assigningAuthorityName] | <code>string</code> | The assigning authority name (e.g. "CIBG"). |
| options.provider | <code>Object</code> | Identification of the individual healthcare provider making the request. |
| options.provider.extension | <code>string</code> | Identifier within the identification system. |
| options.provider.root | <code>string</code> | OID of the identification system (e.g. "2.16.528.1.1007.3.1" for UZI-numbers). |
| [options.provider.assigningAuthorityName] | <code>string</code> | The assigning authority name (e.g. "CIBG"). |
| options.role | <code>Object</code> | Profession of the provider. |
| options.role.code | <code>string</code> | The code representing the profession (e.g. "01.013"). |
| options.role.codeSystem | <code>string</code> | The code system. Only "2.16.840.1.113883.2.4.15.111" is supported here. |
| options.role.codeSystemName | <code>string</code> | The code system name. Only "RoleCodeNL" is supported here. |
| options.role.displayName | <code>string</code> | Display name of the profession (e.g. "Arts v. maag-darm-leverziekten"). |
| options.providerInstitution | <code>Object</code> | Identification of the healthcare provider organization. |
| options.providerInstitution.extension | <code>string</code> | Identifier within the identification system. |
| options.providerInstitution.root | <code>string</code> | OID of the identification system (only "2.16.528.1.1007.3.3" is supported here). |
| [options.providerInstitution.assigningAuthorityName] | <code>string</code> | The assigning authority name. |
| options.healthcareFacilityTypeCode | <code>Object</code> | Category of the healthcare provider organization. |
| options.healthcareFacilityTypeCode.code | <code>string</code> | The code representing the category (e.g. "V6"). |
| options.healthcareFacilityTypeCode.codeSystem | <code>string</code> | The code system (only "2.16.840.1.113883.2.4.15.1060" is supported here). |
| options.healthcareFacilityTypeCode.displayName | <code>string</code> | Display name of the category (e.g. "Algemeen ziekenhuis"). |
| options.purposeOfUse | <code>Object</code> | The purpose of use for which the data is requested. Defaults to TREAT. |
| options.purposeOfUse.code | <code>string</code> | The code representing the purpose (e.g. "TREAT"). |
| options.purposeOfUse.codeSystem | <code>string</code> | The code system (only "2.16.840.1.113883.1.11.20448" is supported here). |
| options.purposeOfUse.displayName | <code>string</code> | Display name of the purpose (e.g. "treatment"). |

<a name="MitzConnector+open"></a>

### mitzConnector.open(options) ⇒ <code>Promise.&lt;Array.&lt;Object&gt;&gt;</code>
Perform a patient location query (IHE XCPD ITI-56; "open vraag").

**Kind**: instance method of [<code>MitzConnector</code>](#MitzConnector)  
**Returns**: <code>Promise.&lt;Array.&lt;Object&gt;&gt;</code> - A Promise which resolves to an array of patient location responses. Each entry
contains the following properties:
- homeCommunityId: The Home Community ID of the responding system.
- correspondingPatientId: The patient ID as known in the responding system.
- sourceId: The Source ID identifying the source system within the Home Community.
- authorInstitution: Identification of the institution that authored the data, with 'root' and 'extension' properties.
- ura: The UZI-registratienummer of the author institution, if available.
An empty array is returned when there is no location found for the given patient, or no permission is granted.  

| Param | Type | Description |
| --- | --- | --- |
| options | <code>string</code> | ...include all options for createAssertion(). |
| options.bsn | <code>string</code> | The BSN (Dutch SSN) of the patient. |

<a name="MitzConnector+subscribe"></a>

### mitzConnector.subscribe(options) ⇒ <code>Promise.&lt;Object&gt;</code>
Create a Subscription in Mitz. This will cause Mitz to:
- register the provider as a potential data holder for the given patient
- send notifications when the patient consent changes

**Kind**: instance method of [<code>MitzConnector</code>](#MitzConnector)  
**Returns**: <code>Promise.&lt;Object&gt;</code> - An object containing an `id` property which is the Subscription id in Mitz.  

| Param | Type | Description |
| --- | --- | --- |
| options | <code>string</code> | ...include all options for createAssertion(). |
| options.bsn | <code>string</code> | The BSN (Dutch SSN) of the patient. |
| options.birthDate | <code>string</code> | The patient's birth date. This value is (conditionally) required when the Mitz-connector has a verified birth date. |
| options.gatewayUri | <code>string</code> | Identifier of the exchange system (US). Must be a URI using the urn:oid scheme. The value corresponds with homeCommunityId in the response to open(). |
| options.sourceSystemUri | <code>string</code> | Identifier of the source system. Must be a URI using the urn:oid scheme. The value corresponds with sourceId in the response to open(). |
| options.notificationUrl | <code>string</code> | The URL to which notifications should be sent. |

