import pretty from 'pino-pretty'

const LEVELS = {
    10: ({colors}) => colors.bold(colors.magenta('TRACE')),
    20: ({colors}) => colors.bold(colors.blue('DEBUG')),
    25: ({colors}) => colors.bold(colors.gray('DEPRECATE')),
    30: ({colors}) => colors.bold(colors.green('INFO')),
    40: ({colors}) => colors.bold(colors.yellow('WARN')),
    50: ({colors}) => colors.bold(colors.red('ERROR')),
    60: ({colors}) => colors.bold(colors.red('FATAL')),
    Infinity: ({colors}) => colors.dim('SILENT'),
}

export default opts => pretty({
    ...opts,
    customPrettifiers: {
        level: (level, key, {}, extras) => {
            return LEVELS[level](extras)
        },
        // name: (name, key, {}, {colors}) => `${name}`,
    },
})
