const fs = require('fs');

module.exports = function (ucdPath) {
  let codePoint, cp, end, line, name, parts;
  if (ucdPath == null) {
    ucdPath = __dirname + '/data';
  }
  const codePoints = [];

  const parseCodes = function (code) {
    if (!code) {
      return null;
    }
    return code.split(' ').filter((i) => i).map((i) => parseInt(i, 16));
  };

  // Class that represents a unicode code point
  class CodePoint {
    constructor(parts) {
      let decimal, digit;
      [this.code, this.name, this.category,
      this.combiningClass, this.bidiClass,
      this.decomposition, decimal, digit,
      this.numeric, this.bidiMirrored, this.unicode1Name,
      this.isoComment, this.uppercase, this.lowercase,
      this.titlecase] = parts;

      this.code = parseInt(this.code, 16);
      this.combiningClass = parseInt(this.combiningClass) || 0;
      this.decomposition = parseCodes(this.decomposition) || [];
      this.bidiMirrored = this.bidiMirrored === 'Y';

      this.uppercase = this.uppercase ? [parseInt(this.uppercase, 16)] : null;
      this.lowercase = this.lowercase ? [parseInt(this.lowercase, 16)] : null;
      this.titlecase = this.titlecase ? [parseInt(this.titlecase, 16)] : null;
      this.folded = null;
      this.caseConditions = null;

      this.isCompat = false;
      this.isExcluded = false;
      if (this.decomposition.length && isNaN(this.decomposition[0])) {
        this.isCompat = true;
        this.decomposition.shift();
      }

      this.compositions = {}; // set later
      this.combiningClassName = null;
      this.block = null;
      this.script = null;
      this.eastAsianWidth = null;
      this.joiningType = null;
      this.joiningGroup = null;
      this.indicSyllabicCategory = null;
      this.indicPositionalCategory = null;

      for (let prop of ['NFD_QC', 'NFKD_QC', 'NFC_QC', 'NFKC_QC']) {
        this[prop] = 0; // Yes
      }

      if ((decimal && (decimal !== this.numeric)) || (digit && (digit !== this.numeric))) {
        throw new Error('Decimal or digit does not match numeric value');
      }
    }

    copy(codePoint) {
      const res = new CodePoint([]);
      for (let key of Object.keys(this)) {
        const val = this[key];
        res[key] = val;
      }

      res.code = codePoint;
      return res;
    }
  }

  // Parse the main unicode data file
  let data = fs.readFileSync(ucdPath + '/UnicodeData.txt', 'ascii');

  let rangeStart = -1;
  for (line of data.split('\n')) {
    if (line.length > 0) {
      parts = line.split(';');
      name = parts[1];
      codePoint = new CodePoint(parts);

      if (rangeStart >= 0) {
        var i;
        if (!/<.+, Last>/.test(name)) {
          throw new Error('No range end found');
        }

        for (i = rangeStart, cp = i, end = codePoint.code; i <= end; i++ , cp = i) {
          codePoints[cp] = codePoint.copy(cp);
        }

        rangeStart = -1;
      } else if (/<.+, First>/.test(name)) {
        rangeStart = codePoint.code;
      } else {
        codePoints[codePoint.code] = codePoint;
      }
    }
  }

  // Helper function to read a file from the unicode database
  const readFile = function (filename, parse, fn) {
    if (typeof parse === 'function') {
      fn = parse;
      parse = true;
    }

    data = fs.readFileSync(ucdPath + '/' + filename, 'ascii');
    for (line of data.split('\n')) {
      line = line.trim();
      if ((line.length > 0) && (line[0] !== '#')) {
        parts = line.replace(/\s*#.*$/, '').split(/\s*;\s*/);

        // Parse codepoint range if requested
        if (parse) {
          var match = parts[0].match(/([a-z0-9]+)\.\.([a-z0-9]+)/i);
          if (match) {
            const start = parseInt(match[1], 16);
            end = parseInt(match[2], 16);
            parts[0] = [start, end];
          } else {
            cp = parseInt(parts[0], 16);
            if (!isNaN(cp)) {
              parts[0] = [cp, cp];
            }
          }
        }

        fn(parts);
      }
    }

  };

  readFile('extracted/DerivedNumericValues.txt', function (parts) {
    let start;
    [start, end] = parts[0];
    const val = parts[3];
    for (cp = start; cp <= end; cp++) {
      codePoint = codePoints[cp];
      if (!codePoint.numeric) {
        cp.numeric = val;
      }
    }
  });

  const combiningClasses = {};
  const joiningTypes = {};
  readFile('PropertyValueAliases.txt', false, function (parts) {
    if (parts[0] === 'ccc') {
      const num = parseInt(parts[1]);
      name = parts[3];
      combiningClasses[num] = name;
    }

    if (parts[0] === 'jt') {
      joiningTypes[parts[1]] = parts[2];
    }
  });

  for (codePoint of codePoints) {
    if (codePoint) {
      codePoint.combiningClassName = combiningClasses[codePoint.combiningClass];
    }
  }

  readFile('Blocks.txt', function (parts) {
    let start;
    [start, end] = parts[0];
    for (cp = start; cp <= end; cp++) {
      if (codePoints[cp]) {
        codePoints[cp].block = parts[1];
      }
    }
  });

  readFile('Scripts.txt', function (parts) {
    let start;
    [start, end] = parts[0];
    for (cp = start; cp <= end; cp++) {
      if (codePoints[cp]) {
        codePoints[cp].script = parts[1];
      }
    }
  });

  readFile('EastAsianWidth.txt', function (parts) {
    let start;
    [start, end] = parts[0];
    for (cp = start; cp <= end; cp++) {
      if (codePoints[cp]) {
        codePoints[cp].eastAsianWidth = parts[1];
      }
    }
  });

  readFile('SpecialCasing.txt', function (parts) {
    let conditions;
    const code = parts[0][0];
    const lower = parseCodes(parts[1]);
    const title = parseCodes(parts[2]);
    const upper = parseCodes(parts[3]);
    if (parts[4]) {
      conditions = parts[4].split(/\s+/);
    }

    if (!conditions) {
      codePoint = codePoints[code];
      codePoint.uppercase = upper;
      codePoint.lowercase = lower;
      codePoint.titlecase = title;
    }

    if (conditions) {
      codePoint.caseConditions = conditions;
    }
  });

  readFile('CaseFolding.txt', function (parts) {
    const code = parts[0][0];
    const type = parts[1];
    const folded = parseCodes(parts[2]);

    if (['C', 'F'].includes(type)) {
      codePoint = codePoints[code];
      if (!codePoint.lowercase || (codePoint.lowercase.join('|') !== folded.join('|'))) {
        codePoint.folded = folded;
      }
    }
  });

  readFile('CompositionExclusions.txt', function (parts) {
    const code = parts[0][0];
    codePoints[code].isExcluded = true;
  });

  readFile('DerivedNormalizationProps.txt', function (parts) {
    let start;
    [start, end] = parts[0];
    let prop = parts[1];
    let val = parts[2];

    if (['NFD_QC', 'NFKD_QC', 'NFC_QC', 'NFKC_QC'].includes(prop)) {
      for (let code = start; code <= end; code++) {
        codePoints[code][prop] = val === 'Y' ? 0 : val === 'N' ? 1 : 2;
      }
    }
  });

  readFile('ArabicShaping.txt', function (parts) {
    let start;
    [start, end] = parts[0];
    let name = parts[1];
    let joiningType = parts[2];
    let joiningGroup = parts[3];

    for (let code = start; code <= end; code++) {
      if (codePoints[code]) {
        codePoints[code].joiningType = joiningTypes[joiningType];
        codePoints[code].joiningGroup = joiningGroup;
      }
    }
  });

  readFile('IndicPositionalCategory.txt', function (parts) {
    let start;
    [start, end] = parts[0];
    let prop = parts[1];

    for (let code = start; code <= end; code++) {
      if (codePoints[code]) {
        codePoints[code].indicPositionalCategory = prop;
      }
    }
  });

  readFile('IndicSyllabicCategory.txt', function (parts) {
    let start;
    [start, end] = parts[0];
    let prop = parts[1];

    for (let code = start; code <= end; code++) {
      if (codePoints[code]) {
        codePoints[code].indicSyllabicCategory = prop;
      }
    }
  });

  for (codePoint of codePoints) {
    if (codePoint && (codePoint.decomposition.length > 1) && !codePoint.isCompat && !codePoint.isExcluded) {
      cp = codePoints[codePoint.decomposition[1]];
      cp.compositions[codePoint.decomposition[0]] = codePoint.code;
    }
  }

  return codePoints;
};
