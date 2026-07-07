"use strict";

var SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function requireText(text) {
  if (typeof text !== "string") {
    throw new Error("Level pack integrity text must be a string.");
  }
  return text;
}

function utf8Bytes(text) {
  var source = requireText(text);
  var bytes = [];
  for (var index = 0; index < source.length; index += 1) {
    var code = source.charCodeAt(index);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6));
      bytes.push(0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff) {
      index += 1;
      if (index >= source.length) {
        throw new Error("Level pack integrity text contains an unmatched high surrogate.");
      }
      var nextCode = source.charCodeAt(index);
      if (nextCode < 0xdc00 || nextCode > 0xdfff) {
        throw new Error("Level pack integrity text contains an invalid surrogate pair.");
      }
      var codePoint = 0x10000 + (((code & 0x3ff) << 10) | (nextCode & 0x3ff));
      bytes.push(0xf0 | (codePoint >> 18));
      bytes.push(0x80 | ((codePoint >> 12) & 0x3f));
      bytes.push(0x80 | ((codePoint >> 6) & 0x3f));
      bytes.push(0x80 | (codePoint & 0x3f));
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error("Level pack integrity text contains an unmatched low surrogate.");
    } else {
      bytes.push(0xe0 | (code >> 12));
      bytes.push(0x80 | ((code >> 6) & 0x3f));
      bytes.push(0x80 | (code & 0x3f));
    }
  }
  return bytes;
}

function utf8ByteLength(text) {
  return utf8Bytes(text).length;
}

function rightRotate(value, bits) {
  return (value >>> bits) | (value << (32 - bits));
}

function toHex(value) {
  return ("00000000" + (value >>> 0).toString(16)).slice(-8);
}

function sha256Bytes(bytes) {
  if (!Array.isArray(bytes)) {
    throw new Error("sha256Bytes requires byte array.");
  }
  var words = [];
  for (var index = 0; index < bytes.length; index += 1) {
    if (!Number.isInteger(bytes[index]) || bytes[index] < 0 || bytes[index] > 255) {
      throw new Error("sha256Bytes received invalid byte.");
    }
    words[index >> 2] = (words[index >> 2] | (bytes[index] << (24 - ((index % 4) * 8)))) >>> 0;
  }

  words[bytes.length >> 2] = (words[bytes.length >> 2] | (0x80 << (24 - ((bytes.length % 4) * 8)))) >>> 0;
  var lengthWordIndex = (((bytes.length + 8) >> 6) + 1) * 16;
  words[lengthWordIndex - 2] = Math.floor(bytes.length / 0x20000000);
  words[lengthWordIndex - 1] = (bytes.length << 3) >>> 0;

  var h0 = 0x6a09e667;
  var h1 = 0xbb67ae85;
  var h2 = 0x3c6ef372;
  var h3 = 0xa54ff53a;
  var h4 = 0x510e527f;
  var h5 = 0x9b05688c;
  var h6 = 0x1f83d9ab;
  var h7 = 0x5be0cd19;
  var w = new Array(64);

  for (var chunk = 0; chunk < words.length; chunk += 16) {
    for (var wordIndex = 0; wordIndex < 64; wordIndex += 1) {
      if (wordIndex < 16) {
        w[wordIndex] = words[chunk + wordIndex] >>> 0;
      } else {
        var s0 = rightRotate(w[wordIndex - 15], 7) ^ rightRotate(w[wordIndex - 15], 18) ^ (w[wordIndex - 15] >>> 3);
        var s1 = rightRotate(w[wordIndex - 2], 17) ^ rightRotate(w[wordIndex - 2], 19) ^ (w[wordIndex - 2] >>> 10);
        w[wordIndex] = (w[wordIndex - 16] + s0 + w[wordIndex - 7] + s1) >>> 0;
      }
    }

    var a = h0;
    var b = h1;
    var c = h2;
    var d = h3;
    var e = h4;
    var f = h5;
    var g = h6;
    var h = h7;

    for (var round = 0; round < 64; round += 1) {
      var sigma1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      var ch = (e & f) ^ ((~e) & g);
      var temp1 = (h + sigma1 + ch + SHA256_K[round] + w[round]) >>> 0;
      var sigma0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      var maj = (a & b) ^ (a & c) ^ (b & c);
      var temp2 = (sigma0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4) + toHex(h5) + toHex(h6) + toHex(h7);
}

function sha256Text(text) {
  return sha256Bytes(utf8Bytes(text));
}

function assertPackTextMatches(packInfo, text) {
  if (!packInfo || typeof packInfo !== "object" || Array.isArray(packInfo)) {
    throw new Error("Level pack integrity requires packInfo.");
  }
  if (typeof packInfo.id !== "string" || !packInfo.id) {
    throw new Error("Level pack integrity requires packInfo.id.");
  }
  if (!Number.isInteger(packInfo.bytes) || packInfo.bytes <= 0) {
    throw new Error("Level pack integrity requires positive packInfo.bytes: " + packInfo.id);
  }
  if (typeof packInfo.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(packInfo.sha256)) {
    throw new Error("Level pack integrity requires valid packInfo.sha256: " + packInfo.id);
  }

  var actualBytes = utf8ByteLength(text);
  if (actualBytes !== packInfo.bytes) {
    throw new Error("Remote level pack bytes mismatch: " + packInfo.id + " expected=" + packInfo.bytes + " actual=" + actualBytes);
  }
  var actualSha256 = sha256Text(text);
  if (actualSha256 !== packInfo.sha256) {
    throw new Error("Remote level pack sha256 mismatch: " + packInfo.id + " expected=" + packInfo.sha256 + " actual=" + actualSha256);
  }
  return true;
}

module.exports = {
  utf8ByteLength: utf8ByteLength,
  sha256Text: sha256Text,
  assertPackTextMatches: assertPackTextMatches
};
