"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Reader = Reader;
exports.externalBuffer = void 0;

var _streams = _interopRequireDefault(require("./streams"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const doneReadingSet = new WeakSet();
const externalBuffer = Symbol('externalBuffer');
/**
 * A wrapper class over the native ReadableStreamDefaultReader.
 * This additionally implements pushing back data on the stream, which
 * lets us implement peeking and a host of convenience functions.
 * It also lets you read data other than streams, such as a Uint8Array.
 * @class
 */

exports.externalBuffer = externalBuffer;

function Reader(input) {
  this.stream = input;

  if (input[externalBuffer]) {
    this[externalBuffer] = input[externalBuffer].slice();
  }

  let streamType = _streams.default.isStream(input);

  if (streamType === 'node') {
    input = _streams.default.nodeToWeb(input);
  }

  if (streamType) {
    const reader = input.getReader();
    this._read = reader.read.bind(reader);
    this._releaseLock = reader.releaseLock.bind(reader);
    return;
  }

  let doneReading = false;

  this._read = async () => {
    if (doneReading || doneReadingSet.has(input)) {
      return {
        value: undefined,
        done: true
      };
    }

    doneReading = true;
    return {
      value: input,
      done: false
    };
  };

  this._releaseLock = () => {
    if (doneReading) {
      try {
        doneReadingSet.add(input);
      } catch (e) {}
    }
  };
}
/**
 * Read a chunk of data.
 * @returns {Promise<Object>} Either { done: false, value: Uint8Array | String } or { done: true, value: undefined }
 * @async
 */


Reader.prototype.read = async function () {
  if (this[externalBuffer] && this[externalBuffer].length) {
    const value = this[externalBuffer].shift();
    return {
      done: false,
      value
    };
  }

  return this._read();
};
/**
 * Allow others to read the stream.
 */


Reader.prototype.releaseLock = function () {
  if (this[externalBuffer]) {
    this.stream[externalBuffer] = this[externalBuffer];
  }

  this._releaseLock();
};
/**
 * Read up to and including the first \n character.
 * @returns {Promise<String|Undefined>}
 * @async
 */


Reader.prototype.readLine = async function () {
  let buffer = [];
  let returnVal;

  while (!returnVal) {
    let {
      done,
      value
    } = await this.read();
    value += '';

    if (done) {
      if (buffer.length) return _streams.default.concat(buffer);
      return;
    }

    const lineEndIndex = value.indexOf('\n') + 1;

    if (lineEndIndex) {
      returnVal = _streams.default.concat(buffer.concat(value.substr(0, lineEndIndex)));
      buffer = [];
    }

    if (lineEndIndex !== value.length) {
      buffer.push(value.substr(lineEndIndex));
    }
  }

  this.unshift(...buffer);
  return returnVal;
};
/**
 * Read a single byte/character.
 * @returns {Promise<Number|String|Undefined>}
 * @async
 */


Reader.prototype.readByte = async function () {
  const {
    done,
    value
  } = await this.read();
  if (done) return;
  const byte = value[0];
  this.unshift(_streams.default.slice(value, 1));
  return byte;
};
/**
 * Read a specific amount of bytes/characters, unless the stream ends before that amount.
 * @returns {Promise<Uint8Array|String|Undefined>}
 * @async
 */


Reader.prototype.readBytes = async function (length) {
  const buffer = [];
  let bufferLength = 0;

  while (true) {
    const {
      done,
      value
    } = await this.read();

    if (done) {
      if (buffer.length) return _streams.default.concat(buffer);
      return;
    }

    buffer.push(value);
    bufferLength += value.length;

    if (bufferLength >= length) {
      const bufferConcat = _streams.default.concat(buffer);

      this.unshift(_streams.default.slice(bufferConcat, length));
      return _streams.default.slice(bufferConcat, 0, length);
    }
  }
};
/**
 * Peek (look ahead) a specific amount of bytes/characters, unless the stream ends before that amount.
 * @returns {Promise<Uint8Array|String|Undefined>}
 * @async
 */


Reader.prototype.peekBytes = async function (length) {
  const bytes = await this.readBytes(length);
  this.unshift(bytes);
  return bytes;
};
/**
 * Push data to the front of the stream.
 * @param {...(Uint8Array|String|Undefined)} values
 */


Reader.prototype.unshift = function (...values) {
  if (!this[externalBuffer]) {
    this[externalBuffer] = [];
  }

  this[externalBuffer].unshift(...values.filter(value => value && value.length));
};
/**
 * Read the stream to the end and return its contents, concatenated by the join function (defaults to streams.concat).
 * @param {Function} join
 * @returns {Promise<Uint8array|String|Any>} the return value of join()
 * @async
 */


Reader.prototype.readToEnd = async function (join = _streams.default.concat) {
  const result = [];

  while (true) {
    const {
      done,
      value
    } = await this.read();
    if (done) break;
    result.push(value);
  }

  return join(result);
};