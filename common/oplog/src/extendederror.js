export default class ExtendedError extends Error {
    constructor(message, options = {}) {
        const { cause, details } = options
        const { code } = cause ? Object.assign({ ...cause }, options) : options

        super(message)

        if (code) {
            this.code = code
        }

        if (cause) {
            this.stack += '\nCaused by: ' + (cause instanceof Error ? cause.stack : cause)
            this.cause = cause
        }

        if (details) {
            this.details = details
        }
    }

    toString() {
        return this.message
    }

    static get BAD_GATEWAY() {
        return 502
    }

    static get BAD_REQUEST() {
        return 400
    }

    static get CONFLICT() {
        return 409
    }

    static get FORBIDDEN() {
        return 403
    }

    static get INTERNAL_SERVER_ERROR() {
        return 500
    }

    static get METHOD_NOT_ALLOWED() {
        return 405
    }

    static get NOT_ACCEPTABLE() {
        return 406
    }

    static get NOT_FOUND() {
        return 404
    }

    static get SERVICE_UNAVAILABLE() {
        return 503
    }

    static get UNAUTHORIZED() {
        return 401
    }

    static get UNPROCESSABLE_ENTITY() {
        return 422
    }

    static get NOT_IMPLEMENTED() {
        return 501
    }

    static get UNSUPPORTED_MEDIA_TYPE() {
        return 415
    }
}
