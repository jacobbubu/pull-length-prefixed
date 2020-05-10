import * as pull from 'pull-stream'
import { pushable } from '@jacobbubu/pull-pushable'
import varint = require('varint')
import { encode, decode } from '../src'

describe('pull-length-prefixed', () => {
  it('basic', (done) => {
    const input = [Buffer.from('hello '), Buffer.from('world')]

    pull(
      pull.values(input),
      encode(),
      pull.collect((err, encoded) => {
        expect(err).toBeFalsy()

        const helloLen = Buffer.from(varint.encode(input[0].length))
        const worldLen = Buffer.from(varint.encode(input[1].length))
        expect(encoded).toEqual([
          Buffer.concat([
            Buffer.alloc(helloLen.length, helloLen, 'utf8'),
            Buffer.alloc(input[0].length, input[0], 'utf8'),
          ]),
          Buffer.concat([
            Buffer.alloc(worldLen.length, worldLen, 'utf8'),
            Buffer.alloc(input[1].length, input[1], 'utf8'),
          ]),
        ])

        pull(
          pull.values(encoded),
          decode(),
          pull.collect((err, output) => {
            expect(err).toBeFalsy()
            expect(input).toEqual(output)
            done()
          })
        )
      })
    )
  })

  it('max length', (done) => {
    const input = [Buffer.from('hello '), Buffer.from('world')]

    pull(
      pull.values(input),
      encode(),
      pull.collect((err, encoded) => {
        if (err) throw err

        const helloLen = Buffer.from(varint.encode(input[0].length))
        const worldLen = Buffer.from(varint.encode(input[1].length))
        expect(encoded).toEqual([
          Buffer.concat([
            Buffer.alloc(helloLen.length, helloLen, 'utf8'),
            Buffer.alloc('hello '.length, 'hello ', 'utf8'),
          ]),
          Buffer.concat([
            Buffer.alloc(worldLen.length, worldLen, 'utf8'),
            Buffer.alloc('world'.length, 'world', 'utf8'),
          ]),
        ])

        pull(
          pull.values(encoded),
          decode({ maxLength: 1 }),
          pull.collect((err) => {
            expect(err).toHaveProperty('message', 'size longer than max permitted length of 1!')
            done()
          })
        )
      })
    )
  })

  it('zero length', (done) => {
    pull(
      pull.values(),
      encode(),
      pull.collect((err, encoded) => {
        expect(err).toBeFalsy()
        expect(encoded).toEqual([])

        pull(
          pull.values([Buffer.alloc(0), Buffer.from('more data')]),
          encode(),
          decode(),
          pull.collect((err, decoded) => {
            expect(err).toBeFalsy()
            expect(decoded).toEqual([Buffer.alloc(0), Buffer.from('more data')])
            done()
          })
        )
      })
    )
  })

  it('push time based', (done) => {
    const p = pushable()
    const input: Buffer[] = []
    let i = 0

    push()
    function push() {
      setTimeout(() => {
        const val = Buffer.from(`hello ${i}`)
        p.push(val)
        input.push(val)
        i++

        if (i < 20) {
          push()
        } else {
          p.end()
        }
      }, 10)
    }

    pull(
      p,
      encode(),
      decode(),
      pull.collect((err, output) => {
        expect(err).toBeFalsy()
        expect(input).toEqual(output)
        done()
      })
    )
  })

  it('invalid prefix', (done) => {
    const input = [Buffer.from('br34k mai h34rt')]

    pull(
      // encode valid input
      pull.values(input),
      encode(),
      // corrupt data
      pull.map((data) => data.slice(0, -6)),
      // attempt decode
      decode(),
      pull.collect((err, output) => {
        expect(err).toBeInstanceOf(Error)
        expect(output).toEqual([])
        done()
      })
    )
  })
})

describe('back pressure', () => {
  let input: Buffer[]

  beforeEach(() => {
    input = []
    for (let j = 0; j < 200; j++) {
      const a = []
      for (let i = 0; i < 200; i++) {
        a[i] = String(i)
      }

      input.push(Buffer.from(a.join('')))
    }
  })

  it('encode - slow in - fast out', (done) => {
    pull(
      pull.values(input),
      delay(10),
      encode(),
      decode(),
      pull.collect((err, res) => {
        expect(err).toBeFalsy()
        expect(res).toEqual(input)
        done()
      })
    )
  })

  it('decode - slow in - fast out', (done) => {
    pull(
      pull.values(input),
      encode(),
      delay(10),
      decode(),
      pull.collect((err, res) => {
        expect(err).toBeFalsy()
        expect(res).toEqual(input)
        done()
      })
    )
  })
})

function delay(time: number) {
  return pull.asyncMap((val, cb) => {
    setTimeout(() => {
      cb(null, val)
    }, time)
  })
}
