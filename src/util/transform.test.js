const { describe, test, expect } = require("@jest/globals");
const { transformFunctionValuesToReturnValues } = require("./tranform");

describe('transform', () => {
  test('should pass', () => {
    const data = [{
      isFoo: true,
      isBar: () => false,
      foo: {
        bar: [{
          isDoo: () => true,
          isGoo: false,
        }],
        map: new Map(),
        date: new Date(),
        error: new Error(''),
        arraybuffer: new ArrayBuffer(0),
        buffer: Buffer.from(''),
        set: new Set(),
        uint8array: new Uint8Array(0),
        int8array: new Int8Array(0),
        string: new String('abc'),
      },
    }]
    const res = transformFunctionValuesToReturnValues(data)

    expect(res[0].isFoo).toEqual(data[0].isFoo)
    expect(res[0].isBar).toEqual(data[0].isBar())
    expect(res[0].foo.bar[0].isDoo).toEqual(data[0].foo.bar[0].isDoo())
    expect(res[0].foo.bar[0].isGoo).toEqual(data[0].foo.bar[0].isGoo)
    expect(res[0].foo.map instanceof Map).toBe(true)
    expect(res[0].foo.date instanceof Date).toBe(true)
    expect(res[0].foo.error instanceof Error).toBe(true)
    expect(res[0].foo.arraybuffer instanceof ArrayBuffer).toBe(true)
    expect(res[0].foo.buffer instanceof Buffer).toBe(true)
    expect(res[0].foo.set instanceof Set).toBe(true)
    expect(res[0].foo.string.toString()).toBe('abc')
    expect(res[0].foo.uint8array instanceof Uint8Array).toBe(true)
    expect(res[0].foo.int8array instanceof Int8Array).toBe(true)
  })
})