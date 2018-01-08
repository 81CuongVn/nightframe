const morgan = require('morgan');
const path = require('path');
const mkdirp = require('mkdirp');
const Transport = require('./logger/transport.js');
const Formatter = require('./logger/formatter.js');
const Utils = require('../util/utils.js');

class Logger {
  static get Severity() {
    return {
      INFO : 'INFO',
      ERROR : 'ERROR',
      WARN : 'WARN',
      DEBUG : 'DEBUG'
    }
  }

  static get defaultFileName() {
    return 'access.log';
  }

  static get errorFileName() {
    return 'error.log';
  }

  /**
   * @constructor
   * @param {String} logPath
   * @param {Object} options
   */
  constructor(logPath, options = {}) {
    logPath = path.resolve(logPath);
    if (!Utils.dirExistsSync(logPath)) {
      mkdirp.sync(logPath);
    }

    this.logPath = logPath;
    this.transport = null;
    this.options = options;

    this.severity = this.options.severity || Logger.Severity.INFO;
    this.createTransport();
  }

  accessLogEntry() {
    return Formatter.createLogEntry(this.severity, {
      originalUrl: ':uri',
      url: ':url',
      statusCode: ':status',
      method: ':method',
      timeTakenMs: ':response-time'
    });
  }

  getFileName() {
    return this.severity === Logger.Severity.ERROR ?
      Logger.errorFileName :
      Logger.defaultFileName;
  }

  createTransport() {
    let fileName = this.getFileName();
    let usedTransports = [
      Transport.File(path.join(this.logPath, fileName))
    ];

    if (this.options.logToConsole) {
      usedTransports.push(Transport.Console());
    }

    this.transport = Transport.create(usedTransports);
  }

  logAccess(message) {
    return this.transport.info(message);
  }

  logError(message) {
    return this.transport.error(message);
  }

  static createRequestLogger(logDirPath, applicationId, options) {
    Formatter.defineTokens(applicationId, options);

    let logger = new Logger(logDirPath, options);
    let logMessage = logger.accessLogEntry();

    return morgan(JSON.stringify(logMessage), {
      stream: {
        write(message) {
          logger.logAccess(message);
        }
      }
    })
  }

  static createErrorLogger(logDirPath, applicationId, options) {
    Formatter.defineTokens(applicationId, options);

    let logger = new Logger(logDirPath, options);

    return function logError(err, req, res, next) {
      let logMessage = Formatter.createErrorLogEntry(err);
      let formatted = JSON.stringify(logMessage);

      try {
        return morgan(formatted, {
          stream: {
            write(message) {
              message = message.replace(/\\/g, '/');

              return logger.logError(message);
            }
          }
        })(req, res, function() {
          next(err);
        });
      } catch (ex) {
        ex.statusCode = 500;

        return next(ex);
      }

    }
  }
}

module.exports = Logger;