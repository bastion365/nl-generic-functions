import { ExtendedError, Logger } from '@bastion365/oplog'

const logger = Logger('bind')

const bind = ({ connid, dn, cred, msgid }) => {
    logger.info(`Credentials provided: '${cred}'`)
}

export default bind
