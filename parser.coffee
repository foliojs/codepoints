fs = require 'fs'

module.exports = (ucdPath = __dirname + '/data')->
  codePoints = []

  parseCodes = (code) ->
    return null if not code
    parseInt(i, 16) for i in code.split(' ') when i

  # Class that represents a unicode code point
  class CodePoint
    constructor: (parts) ->
      [@code, @name, @category,
       @combiningClass, @bidiClass,
       @decomposition, decimal, digit,
       @numeric, @bidiMirrored, @unicode1Name,
       @isoComment, @uppercase, @lowercase,
       @titlecase] = parts

      @code           = parseInt @code, 16
      @combiningClass = parseInt(@combiningClass) or 0
      @decomposition  = parseCodes(@decomposition) or []
      @bidiMirrored   = @bidiMirrored is 'Y'

      @uppercase = if @uppercase then [parseInt @uppercase, 16] else null
      @lowercase = if @lowercase then [parseInt @lowercase, 16] else null
      @titlecase = if @titlecase then [parseInt @titlecase, 16] else null
      @folded = null
      @caseConditions = null

      @isCompat = false
      @isExcluded = false
      if @decomposition.length and isNaN @decomposition[0]
        @isCompat = true
        @decomposition.shift()

      @compositions = {} # set later
      @combiningClassName = null
      @block = null
      @script = null
      @eastAsianWidth = null

      for prop in ['NFD_QC', 'NFKD_QC', 'NFC_QC', 'NFKC_QC']
        this[prop] = 0 # Yes

      if (decimal and decimal isnt @numeric) or (digit and digit isnt @numeric)
        throw new Error 'Decimal or digit does not match numeric value'

    copy: (codePoint) ->
      res = new CodePoint []
      for own key, val of this
        res[key] = val

      res.code = codePoint
      return res

  # Parse the main unicode data file
  data = fs.readFileSync ucdPath + '/UnicodeData.txt', 'ascii'

  rangeStart = -1
  for line in data.split('\n') when line.length > 0
    parts = line.split ';'
    name = parts[1]
    codePoint = new CodePoint parts

    if rangeStart >= 0
      unless /<.+, Last>/.test name
        throw new Error 'No range end found'

      for cp in [rangeStart..codePoint.code] by 1
        codePoints[cp] = codePoint.copy cp

      rangeStart = -1
    else if /<.+, First>/.test name
      rangeStart = codePoint.code
    else
      codePoints[codePoint.code] = codePoint

  # Helper function to read a file from the unicode database
  readFile = (filename, parse, fn) ->
    if typeof parse is 'function'
      fn = parse
      parse = true

    data = fs.readFileSync ucdPath + '/' + filename, 'ascii'
    for line in data.split('\n') when line.length > 0 and line[0] isnt '#'
      parts = line.replace(/\s*#.*$/, '').split /;\s*/

      # Parse codepoint range if requested
      if parse
        if match = parts[0].match /([a-z0-9]+)\.\.([a-z0-9]+)/i
          start = parseInt match[1], 16
          end = parseInt match[2], 16
          parts[0] = [start, end]
        else
          cp = parseInt parts[0], 16
          unless isNaN cp
            parts[0] = [cp, cp]

      fn parts

    return

  readFile 'extracted/DerivedNumericValues.txt', (parts) ->
    [start, end] = parts[0]
    val = parts[3]
    for cp in [start..end] by 1
      codePoint = codePoints[cp]
      unless codePoint.numeric
        cp.numeric = val

      else if val isnt codePoint.numeric
        throw new Error 'Numeric value does not match derived value'

  combiningClasses = {}
  readFile 'PropertyValueAliases.txt', false, (parts) ->
    if parts[0] is 'ccc'
      num = parseInt parts[1]
      name = parts[3]
      combiningClasses[num] = name

  for codePoint in codePoints when codePoint?
    codePoint.combiningClassName = combiningClasses[codePoint.combiningClass]

  readFile 'Blocks.txt', (parts) ->
    [start, end] = parts[0]
    for cp in [start..end] by 1
      codePoints[cp]?.block = parts[1]

  readFile 'Scripts.txt', (parts) ->
    [start, end] = parts[0]
    for cp in [start..end] by 1
      codePoints[cp]?.script = parts[1]

  readFile 'EastAsianWidth.txt', (parts) ->
    [start, end] = parts[0]
    for cp in [start..end] by 1
      codePoints[cp]?.eastAsianWidth = parts[1]

  readFile 'SpecialCasing.txt', (parts) ->
    code = parts[0][0]
    lower = parseCodes parts[1]
    title = parseCodes parts[2]
    upper = parseCodes parts[3]
    if parts[4]
      conditions = parts[4].split /\s+/

    if not conditions
      codePoint = codePoints[code]
      codePoint.uppercase = upper
      codePoint.lowercase = lower
      codePoint.titlecase = title

    if conditions
      codePoint.caseConditions = conditions

  readFile 'CaseFolding.txt', (parts) ->
    code = parts[0][0]
    type = parts[1]
    folded = parseCodes parts[2]

    if type in ['C', 'F']
      codePoint = codePoints[code]
      if not codePoint.lowercase or codePoint.lowercase.join('|') isnt folded.join('|')
        codePoint.folded = folded

  readFile 'CompositionExclusions.txt', (parts) ->
    code = parts[0][0]
    codePoints[code].isExcluded = true

  readFile 'DerivedNormalizationProps.txt', (parts) ->
    [[start, end], prop, val] = parts

    if prop in ['NFD_QC', 'NFKD_QC', 'NFC_QC', 'NFKC_QC']
      for code in [start..end] by 1
        codePoints[code][prop] = if val is 'Y' then 0 else if val is 'N' then 1 else 2

  for codePoint in codePoints
    if codePoint?.decomposition.length > 1 and not codePoint.isCompat and not codePoint.isExcluded
      cp = codePoints[codePoint.decomposition[1]]
      cp.compositions[codePoint.decomposition[0]] = codePoint.code

  codePoints
