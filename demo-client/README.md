# Demo client

The demo client is a web based client with functionality to demonstrate proof-of-concepts for generic functions.

## Quick start

The demo client can be started using `docker compose`:

```bash
docker compose up -d demo-client
```

After startup, the client can be accessed on [http://localhost:8090/](http://localhost:8090/).

## Address book

This section provided the following functionalities:

* *search* is used to search healthcare providers by name, using either the administration directory (to view and edit
  'own' addresses) or the query directory.
* *new organization* is used to add an organization to the administration directory.

## Patients

* *search* uses the [IHE PDQm](https://profiles.ihe.net/ITI/PDQm/index.html) profile to search for patients in a FHIR directory.
