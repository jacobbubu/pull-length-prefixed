import * as pull from 'pull-stream'
import varint = require('varint')
import { encode, decode } from '../src'

describe('pull-length-prefixed', () => {
  it('basics', (done) => {
    const input = [Buffer.from('hello '), Buffer.from('world')]
    const bytes = 4

    pull(
      pull.values(input),
      encode({ fixed: true }),
      pull.collect((err, encoded) => {
        expect(err).toBeFalsy()

        expect(encoded).toEqual([
          Buffer.concat([Buffer.alloc(bytes, '00000006', 'hex'), Buffer.from('hello ')]),
          Buffer.concat([Buffer.alloc(bytes, '00000005', 'hex'), Buffer.from('world')]),
        ])

        pull(
          pull.values(encoded),
          decode({ fixed: true }),
          pull.collect((err, output) => {
            expect(err).toBeFalsy()
            expect(input).toEqual(output)
            done()
          })
        )
      })
    )
  })
})
