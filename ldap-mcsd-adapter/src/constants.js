import { ExtendedError } from '@bastion365/oplog'

const LDAP_STATUS = {
    SUCCESS: 0, // Operation successful
    OPERATIONS_ERROR: 1, // Internal server error
    PROTOCOL_ERROR: 2, // Badly formed request
    TIMELIMIT_EXCEEDED: 3, // Search time limit exceeded
    SIZELIMIT_EXCEEDED: 4, // Search size limit exceeded
    NO_SUCH_OBJECT: 32, // DN does not exist
    ALIAS_PROBLEM: 33, // Alias resolution failed
    INVALID_DN_SYNTAX: 34, // Invalid DN syntax
    INAPPROPRIATE_AUTH: 48, // Wrong type of authentication
    INVALID_CREDENTIALS: 49, // Bad password or authentication failure
    INSUFFICIENT_ACCESS: 50, // Access denied
    BUSY: 51, // Server temporarily busy
    UNAVAILABLE: 52, // Service unavailable
    UNWILLING_TO_PERFORM: 53, // Operation refused
    NAMING_VIOLATION: 64, // DN naming constraint violated
    OBJECT_CLASS_VIOLATION: 65, // Schema violation
    ENTRY_ALREADY_EXISTS: 68, // Tried to add an existing entry
    OTHER: 80, // Generic or unknown error
}

const ERROR_CODE_TO_LDAP_STATUS = {
    [ExtendedError.BAD_GATEWAY]: LDAP_STATUS.UNAVAILABLE,
    [ExtendedError.BAD_REQUEST]: LDAP_STATUS.PROTOCOL_ERROR,
    [ExtendedError.CONFLICT]: LDAP_STATUS.ENTRY_ALREADY_EXISTS,
    [ExtendedError.FORBIDDEN]: LDAP_STATUS.INSUFFICIENT_ACCESS,
    [ExtendedError.INTERNAL_SERVER_ERROR]: LDAP_STATUS.OPERATIONS_ERROR,
    [ExtendedError.METHOD_NOT_ALLOWED]: LDAP_STATUS.INSUFFICIENT_ACCESS,
    [ExtendedError.NOT_FOUND]: LDAP_STATUS.SUCCESS,
    [ExtendedError.SERVICE_UNAVAILABLE]: LDAP_STATUS.UNAVAILABLE,
    [ExtendedError.UNAUTHORIZED]: LDAP_STATUS.INAPPROPRIATE_AUTH,
    [ExtendedError.UNPROCESSABLE_ENTITY]: LDAP_STATUS.OBJECT_CLASS_VIOLATION,
    [ExtendedError.NOT_IMPLEMENTED]: LDAP_STATUS.UNWILLING_TO_PERFORM,
}

export {
    ERROR_CODE_TO_LDAP_STATUS,
    LDAP_STATUS,
}
