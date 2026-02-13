import { ExtendedError } from '@bastion365/oplog'

const parseSearchFilter = str => {
    // Tokenise input, matching parentheses, operators, and attr=value pairs
    const tokens = str.match(/\(|\)|&|\||!|[a-zA-Z0-9._-]+[~<>]?=[^()]+/g)
    if (!tokens)
        throw new ExtendedError('Invalid LDAP filter string', {
            code: ExtendedError.BAD_REQUEST,
        })
    let i = 0

    function parseFilter() {
        if (tokens[i] !== '(')
            throw new ExtendedError(`Expected '(' at token ${i}`, {
                code: ExtendedError.BAD_REQUEST,
            })
        i++ // Skip '('

        const token = tokens[i++]
        switch (token) {
            case '&': {
                const filters = []
                while (tokens[i] !== ')') filters.push(parseFilter())
                i++ // Skip ')'
                return { AND: filters }
            }

            case '|': {
                const filters = []
                while (tokens[i] !== ')') filters.push(parseFilter())
                i++ // Skip ')'
                return { OR: filters }
            }

            case '!': {
                const filter = parseFilter()
                if (tokens[i] !== ')') throw new ExtendedError(`Expected ')' after NOT at token ${i}`, {
                    code: ExtendedError.BAD_REQUEST,
                })
                i++ // Skip ')'
                return { NOT: filter }
            }

            default: {
                // Token looks like attr=value or attr>=value, etc.
                const match = token.match(/^([a-zA-Z0-9._-]+)([~<>]?=)([^)]+)$/)
                if (!match) throw new ExtendedError(`Invalid comparison token: ${token}`, {
                    code: ExtendedError.BAD_REQUEST,
                })
                const [, attr, op, rawValue] = match
                const value = rawValue.trim()

                // Detect wildcards
                const hasWildcard = value.includes('*')

                let opType
                switch (op) {
                    case '=':
                        opType = hasWildcard ? 'LIKE' : 'EQ'
                        break
                    case '~=':
                        opType = 'APPROX' // Approximate/fuzzy match
                        break
                    case '>=':
                        opType = 'GE'
                        break
                    case '<=':
                        opType = 'LE'
                        break
                    default:
                        throw new ExtendedError(`Unknown operator: ${op}`, {
                            code: ExtendedError.BAD_REQUEST,
                        })
                }

                if (tokens[i] !== ')')
                    throw new ExtendedError(`Expected ')' at token ${i}`, {
                        code: ExtendedError.BAD_REQUEST,
                    })
                i++ // Skip ')'
                return { [opType]: { [attr]: value } }
            }
        }
    }

    const result = parseFilter()
    if (i !== tokens.length)
        throw new ExtendedError(`Unexpected trailing tokens after position ${i}`, {
            code: ExtendedError.BAD_REQUEST,
        })
    return result
}

export default parseSearchFilter
