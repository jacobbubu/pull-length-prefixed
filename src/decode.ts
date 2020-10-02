import * as pull from 'pull-stream'
import Reader from '@jacobbubu/pull-reader'
import { pushable } from '@jacobbubu/pull-pushable'
import varint = require('varint')

const MSB = 0x80
const isEndByte = (byte: number) => !(byte & MSB)
const MAX_LENGTH = 1024 * 1024 * 4

type ReaderType = ReturnType<typeof Reader>
type DecodeCb = (err: pull.EndOrError, msg?: Buffer) => void

export interface DecodeOptions {
  fixed?: boolean
  maxLength?: number
}

export function decode(opts: DecodeOptions = {}) {
  let reader = Reader()
  type ReaderType = typeof reader
  let p = pushable((err) => {
    reader.abort(err)
  })

  return (rawRead: pull.Source<Buffer>) => {
    reader(rawRead)

    // this function has to be written without recursion
    // or it blows the stack in case of sync stream
    function next() {
      let doNext = true
      let decoded = false

      const decodeCb: DecodeCb = (err, msg) => {
        decoded = true
        if (err) {
          p.end(err)
          doNext = false
        } else {
          p.push(msg)
          if (!doNext) {
            next()
          }
        }
      }

      while (doNext) {
        decoded = false
        _decodeFromReader(reader, opts, decodeCb)
        if (!decoded) {
          doNext = false
        }
      }
    }

    next()

    return p as pull.Source<Buffer>
  }
}

function _decodeFromReader(reader: ReaderType, opts: DecodeOptions, cb: DecodeCb) {
  opts = { fixed: false, maxLength: MAX_LENGTH, ...opts }

  if (opts.fixed) {
    readFixedMessage(reader, opts.maxLength!, cb)
  } else {
    readVarintMessage(reader, opts.maxLength!, cb)
  }
}

function _isNoMoreDataError(err: pull.EndOrError) {
  return err instanceof Error && err.message.startsWith('stream ended with')
}

function readFixedMessage(reader: ReaderType, maxLength: number, cb: DecodeCb) {
  reader.read(4, (err, bytes) => {
    if (err) {
      return cb(_isNoMoreDataError(err) ? true : err)
    }

    const msgSize = bytes!.readInt32BE(0) // reads exactly 4 bytes
    if (msgSize > maxLength) {
      return cb(new Error('size longer than max permitted length of ' + maxLength + '!'))
    }

    readMessage(reader, msgSize, cb)
  })
}

function readVarintMessage(reader: ReaderType, maxLength: number, cb: DecodeCb) {
  let rawMsgSize: Buffer[] = []
  if (rawMsgSize.length === 0) readByte()

  // Read the varint
  function readByte() {
    reader.read(1, (err, byte) => {
      if (err) {
        return cb(_isNoMoreDataError(err) ? true : err)
      }

      rawMsgSize.push(byte!)

      if (byte && !isEndByte(byte[0])) {
        readByte()
        return
      }

      const msgSize = varint.decode(Buffer.concat(rawMsgSize))
      if (msgSize > maxLength) {
        return cb(new Error('size longer than max permitted length of ' + maxLength + '!'))
      }

      readMessage(reader, msgSize, (err, msg) => {
        if (err) {
          return cb(err)
        }

        rawMsgSize = []

        if (msg!.length < msgSize) {
          return cb(new Error('Message length does not match prefix specified length.'))
        }
        cb(null, msg)
      })
    })
  }
}

function readMessage(reader: ReaderType, size: number, cb: DecodeCb) {
  reader.read(size, (err, msg) => {
    if (err) {
      cb(err)
    } else {
      cb(null, msg)
    }
  })
}
