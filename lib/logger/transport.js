const winston = require('winston');

class Transport {
  static tsFormat() {
    return (new Date()).toLocaleTimeString();
  }

  static File(fileName) {
    return new winston.transports.File({
      level: 'info',
      filename: fileName,
      json: false,
      maxsize: 5242880, //5MB
      colorize: false,
      formatter: function (options) {
        return options.message.replace(/\n$/, '');
      }
    });
  }

  static Console() {
    return new winston.transports.Console({
      colorize: false,
      level: 'info'
    });
  }

  static create(usedTransports) {
    return winston.createLogger({
      transports: usedTransports
    });
  }
}

module.exports = Transport;
