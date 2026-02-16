import { spawn } from 'node:child_process'

async function run(...args) {
    return new Promise((resolve, reject) => {
        const proc = spawn('docker', ['compose', 'run', '--rm', 'update-client', ...args])

        let stdout = ''
        let stderr = ''

        proc.stdout.on('data', chunk => (stdout += chunk))
        proc.stderr.on('data', chunk => (stderr += chunk))

        proc.on('error', err => {
            reject(err)
        })
        proc.on('close', code => {
            if (code !== 0) {
                console.error(`❌ update-client exited with code ${code}`)
                if (stdout) console.error('--- stdout ---\n' + stdout)
                if (stderr) console.error('--- stderr ---\n' + stderr)
            }
            resolve(code)
        })
    })
}

export { run }
