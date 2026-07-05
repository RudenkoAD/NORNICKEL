const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 10;

async function hash(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verify(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = { hash, verify };
