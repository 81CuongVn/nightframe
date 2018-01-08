const fs = require('fs');
const chalk = require('chalk');

const indentRegex = /^/gm;

const Util = module.exports = {};

Util.fileExistsSync = function (path) {
  try {
    return fs.statSync(path).isFile();
  } catch (e) {}

  return false;
};

Util.dirExistsSync = function (path) {
  try {
    return fs.statSync(path).isDirectory();
  } catch (e) {}

  return false;
};

Util.stackTraceFilter = function(parts) {
  let stack = parts.reduce(function(list, line) {
    if (contains(line, [
        'node_modules',
        '(node.js:',
        '(timers.js:',
        '(events.js:',
        '(util.js:',
        '(module.js:',
        '(net.js:'
      ])) {
      return list;
    }

    list.push(line);

    return list;
  }, []);

  return stack.join('\n');
};

Util.showStackTrace = function(stack) {
  let parts = stack.split('\n');
  let headline = parts.shift();

  console.error(chalk.red(headline.replace(indentRegex, '   ')));
  if (parts.length > 0) {
    let result = Util.stackTraceFilter(parts);
    /* eslint-disable no-console */
    console.log(chalk.gray(result.replace(indentRegex, '   ')));
  }
};

function contains(str, text) {
  if (Array.isArray(text)) {
    for (let i = 0; i < text.length; i++) {
      if (contains(str, text[i])) {
        return true;
      }
    }
  }

  return str.indexOf(text) > -1;
}