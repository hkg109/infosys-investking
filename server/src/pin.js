import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const options = { N: 16384, r: 8, p: 1 }

export async function hashPin(pin) {
  const salt = randomBytes(16).toString('hex')
  const hash = await scrypt(pin, salt, 64, options)
  return `scrypt$${salt}$${hash.toString('hex')}`
}

export async function verifyPin(pin, encoded) {
  const [algorithm, salt, digest] = encoded.split('$')
  if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(digest)) return false
  const actual = await scrypt(pin, salt, 64, options)
  return timingSafeEqual(actual, Buffer.from(digest, 'hex'))
}
