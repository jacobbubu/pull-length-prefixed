import * as pull from 'pull-stream'
import varint = require('varint')
const PoolSize = 10 * 1024

export interface EncodeOptions {
  fixed?: boolean
}

export function encode(opts: EncodeOptions = {}) {
  opts = { fixed: false, ...opts }

  const fixed = opts.fixed

  let pool = fixed ? null : createPool()
  let used = 0

  let ended: pull.EndOrError = false

  return (read: pull.Source<Buffer>) => (end: pull.Abort, cb: pull.SourceCallback<Buffer>) => {
    if (end) {
      ended = end
    }

    if (ended) {
      return read(ended, () => cb(true))
    }

    read(null, (end, data) => {
      if (end) {
        ended = end
      }
      if (ended) {
        return cb(ended)
      }

      if (!Buffer.isBuffer(data)) {
        ended = new Error('data must be a buffer')
        return cb(ended)
      }

      const dataLength = data.length
      let headerBytes = 4

      let encodedLength: Buffer
      if (fixed) {
        encodedLength = Buffer.alloc(4)
        encodedLength.writeInt32BE(dataLength, 0) // writes exactly 4 bytes
      } else {
        varint.encode(dataLength, pool!, used)
        headerBytes = varint.encode.bytes
        used += headerBytes
        encodedLength = pool!.slice(used - headerBytes, used)

        if (pool!.length - used < 100) {
          pool = createPool()
          used = 0
        }
      }

      cb(null, Buffer.concat([encodedLength, data], headerBytes + dataLength))
    })
  }
}

function createPool() {
  return Buffer.alloc(PoolSize)
}
