const rules = require('./rules')

module.exports = {
  extends: [
    'eslint:recommended',
  ],
  parserOptions: {
    ecmaVersion: 2018,
  },
  plugins: [
    'import', // https://github.com/benmosher/eslint-plugin-import
  ],
  rules,
}
