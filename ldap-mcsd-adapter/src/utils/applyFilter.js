function applyFilter(entry = {}, filter = {}) {
    const [operation] = Object.keys(filter)
    let match
    if (operation === 'AND') {
        const subfilters = filter[operation] ?? []
        match = subfilters.every(subfilter => applyFilter(entry, subfilter))
    } else if (operation === 'OR') {
        const subfilters = filter[operation] ?? []
        match = subfilters.some(subfilter => applyFilter(entry, subfilter))
    } else if (operation === 'NOT') {
        const subfilter = filter[operation] ?? {}
        match = !applyFilter(entry, subfilter)
    } else if (operation === 'EQ' || operation === 'APPROX') {
        const subfilter = filter[operation] ?? {}
        const [attribute] = Object.keys(subfilter)
        const value = subfilter[attribute]
        const entryValue = entry[attribute]
        if (Array.isArray(entryValue)) {
            match = entryValue.includes(value)
        } else {
            match = entryValue === value
        }
    } else if (operation === 'LIKE') {
        const subfilter = filter[operation] ?? {}
        const [attribute] = Object.keys(subfilter)
        const value = subfilter[attribute]
        const regexString = '^' + value.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'
        const regex = new RegExp(regexString, 'i')
        const entryValue = entry[attribute]
        if (Array.isArray(entryValue)) {
            match = entryValue.some(ev => regex.test(ev))
        } else if (typeof entryValue === 'string') {
            match = regex.test(entryValue)
        } else {
            match = false
        }
    } else if (operation === 'GE') {
        const subfilter = filter[operation] ?? {}
        const [attribute] = Object.keys(subfilter)
        const value = subfilter[attribute]
        const entryValue = entry[attribute]
        if (Array.isArray(entryValue)) {
            match = entryValue.some(ev => ev >= value)
        } else {
            match = entryValue >= value
        }
    } else if (operation === 'LE') {
        const subfilter = filter[operation] ?? {}
        const [attribute] = Object.keys(subfilter)
        const value = subfilter[attribute]
        const entryValue = entry[attribute]
        if (Array.isArray(entryValue)) {
            match = entryValue.some(ev => ev <= value)
        } else {
            match = entryValue <= value
        }
    } else {
        match = false
    }
    return match
}

export default applyFilter
