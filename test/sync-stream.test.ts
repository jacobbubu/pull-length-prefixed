import * as pull from 'pull-stream'
import varint = require('varint')
import { encode, decode } from '../src'

describe('pull-length-prefixed', () => {
  it('sync stream', (done) => {
    const input: Buffer[] = Array.from(Array(500)).map(() => Buffer.from('payload'))

    pull(
      pull.values(input),
      encode(),
      pull.collect((err, encoded) => {
        if (err) throw err

        expect(encoded).toEqual(
          input.map((data) => {
            const len = Buffer.from(varint.encode(data.length))
            return Buffer.concat([
              Buffer.alloc(len.length, len, 'utf8'),
              Buffer.alloc(data.length, data, 'utf8'),
            ])
          })
        )

        pull(
          pull.values(encoded),
          decode(),
          pull.collect((err, output) => {
            if (err) throw err
            expect(input).toEqual(output)
            done()
          })
        )
      })
    )
  })
})
