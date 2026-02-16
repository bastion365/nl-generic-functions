import { ExtendedError, Logger } from '@bastion365/oplog'

const logger = Logger('compare')

const compare = message => {
    throw new ExtendedError('Operation not supported', {
        code: ExtendedError.NOT_IMPLEMENTED,
    })
}

export default compare
