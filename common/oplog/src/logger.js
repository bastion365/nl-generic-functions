import pino from 'pino'

const level = 'trace', // Debug level
    pretty = true // Pretty-print logs to stdout.

const instance = pino(
    {
        name: undefined,
        level,
        customLevels: {
            deprecate: 25,
        },
        base: undefined,
        hooks: {
            logMethod: function (inputArgs, method) {
                return method.call(this, ...inputArgs)
            },
        },
    },
    pino.transport({
        level,
        targets: [
            pretty
                ? {
                      target: './pretty.js',
                      level,
                  }
                : {
                      target: 'pino/file',
                      options: {
                          destination: 1, // stdout
                      },
                      level,
                  },
        ],
    }),
)

export default name => {
    return instance.child({ name })
}
