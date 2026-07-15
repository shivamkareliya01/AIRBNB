const plm = require('passport-local-mongoose');
console.log('typeof require:', typeof plm);
console.log('keys:', Object.keys(plm));
console.log('typeof .default:', typeof plm.default);
if (plm.default) {
    console.log('typeof .default value:', typeof plm.default);
    console.log('.default is function?', typeof plm.default === 'function');
}
