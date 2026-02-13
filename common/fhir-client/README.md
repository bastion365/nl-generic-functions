# @bastion365/client-fhir

FHIR client.

## Usage

### Create a ReST client

#### Example

```javascript
import FhirClient from '@bastion365/client-fhir'

const client = new FhirClient({
    baseUri: 'https://ehr.example.com/fhir',
})
```

### Create resources

#### Example

```javascript
const response = await client.create({
    resourceType: 'Patient',
    name: [{
        family: 'Doe',
        given: ['John'],
    }],
})
```
