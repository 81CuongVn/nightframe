const path = require('path');
const BASE_PATH = 'lib';

module.exports = {
  require(relativeFilePath) {
    return require(path.join('../', BASE_PATH, relativeFilePath));
  },
};
