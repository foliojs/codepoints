/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const codepoints = require('./index');

for (let codepoint of Array.from(codepoints)) { console.log(JSON.stringify(codepoint)); }
