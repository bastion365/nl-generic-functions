import assert from 'node:assert/strict'
const LF = '\n'

const formatResponse = message => {
    assert(message, 'Message empty')

    let line = ''
    for (const key in message) {
        const value = message[key]
        if((value ?? null) === null) {
            continue
        }

        if (Array.isArray(message[key])) {
            for (const val of message[key]) {
                line += `${key}: ${val}` + LF
            }
        } else {
            line += `${key}: ${message[key] ?? ''}` + LF
        }
    }

    line += LF
    return line
}

const formatEntry = (entry = {}) => {
    return `ENTRY: \n${formatResponse(entry)}`
}

const formatResult = ({msgid, code = 0, matched, info} = {}) => {
    return `RESULT: \n${formatResponse({ msgid, code, matched, info })}`
}

export {
    formatEntry,
    formatResult,
}

// See: https://www.openldap.org/software/man.cgi?query=slapd-sock&apropos=0&sektion=0&manpath=OpenLDAP+2.6-Release&arch=default&format=html
