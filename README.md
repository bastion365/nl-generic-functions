# Proof-of-concepts for NL generic functions

This repository contains proof-of-concepts for generic functions for interoperability within the Dutch healthcare.

This repository contains the following artifacts:

* [Address book](./address-book/README.md) with an mCSD interface and sync using LRZa
* [LDAP adapter](./ldap-mcsd-adapter/README.md) to use the address book's mCSD API using LDAP
* [Mitz connector](./mitz-connector/README.md) is a Node.js / Javascript library for localisation and consent checking via using [Mitz](https://www.mitz-toestemming.nl/).
* A basic [client for demonstration purposes](./demo-client/README.md) which can be used to search addresses and patients.
