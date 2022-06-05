/**
 * @template T
 * @template K
 * @typedef {T extends Record<string, any>
 *  ? K extends keyof T ? T[K] : never
 *  : never
 * } IValue
 */

/**
 * @template T
 * @template K
 * @typedef {T extends Record<string, any>
 *  ? IValue<T, K> extends Function ? ReturnType<IValue<T, K>> : IValue<T, K>
 *  : never} IValueOfReturnType
 */

/**
 * @template T
 * @typedef {T extends Array<any>
 *  ? Array<IFunToRetVal<T[number]>>
 *  : { [K in keyof T]: IValueOfReturnType<T, K> }
 * } IFunToRetVal
 */

/**
 * @template T
 * @param {T} target 
 * @param {number} [depth]
 * @param {any} [thisArg]
 * @return {IFunToRetVal<T>}
 */
const transformFunctionValuesToReturnValues = (target, depth = 0, thisArg = null) => {
  if (target instanceof Error
    || target instanceof Date
    || target instanceof ArrayBuffer
    || target instanceof Buffer
    || target instanceof Map
    || target instanceof Set
    || target instanceof Promise
    || target instanceof String
    || target instanceof Number
    || target instanceof Boolean
    || target instanceof Uint8Array
    || target instanceof Uint16Array
    || target instanceof Uint32Array
    || target instanceof Int8Array
    || target instanceof Int16Array
    || target instanceof Int32Array
    || !target
    || typeof target !== 'object'
  ) {
    return target;
  }
  const isArray = Array.isArray(target)
  const res = Object.keys(target).reduce((res, key) => {
    const value = target[key]
    switch (typeof value) {
      case 'function':
        try {
          res[key] = value.call(thisArg || target)
        } catch (e) { }
        break;
      case 'object':
        if (depth >= transformFunctionValuesToReturnValues.MAX_DEPTH) {
          res[key] = value;
          break;
        }
        try {
          res[key] = transformFunctionValuesToReturnValues(value, depth + 1, thisArg || target)
        } catch (e) {
          res[key] = value;
        }
        break;
      default:
        res[key] = value;
    }
    return res;
  }, isArray ? [] : {})
  if (isArray) {
    return res;
  }
  const proto = Object.getPrototypeOf(target)
  if (!proto) {
    return res;
  }
  return { ...res, ...transformFunctionValuesToReturnValues(proto, depth + 1, thisArg || target) };
}

transformFunctionValuesToReturnValues.MAX_DEPTH = 4;

module.exports = { transformFunctionValuesToReturnValues }