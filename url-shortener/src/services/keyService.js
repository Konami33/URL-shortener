const { getUnusedKey } = require('../models/pgKeyModel');

async function fetchUniqueKey() {
  return await getUnusedKey();
}

module.exports = { fetchUniqueKey };