const morgan = require('morgan');
const path = require('path');
const mkdirp = require('mkdirp');
const chalk = require('chalk');
const Transport = require('./logger/transport.js');
const Formatter = require('./logger/formatter.js');
const Utils = require('../util/utils.js');
const TimeUtil = require('../util/time.js');

class Logger {
  static get Severity() {
    return {
      INFO : 'INFO',
      ERROR : 'ERROR',
      WARN : 'WARN',
      DEBUG : 'DEBUG'
    };
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
  constructor(logPath = null, options = {}) {
    this.logPath = logPath;
    this.transport = null;
    this.options = options;
    this.severity = this.options.severity || Logger.Severity.INFO;

    if (logPath) {
      logPath = path.resolve(logPath);
      if (!Utils.dirExistsSync(logPath)) {
        mkdirp.sync(logPath);
      }

      this.createTransport();
    }
  }

  accessLogEntry(formatters = {}) {
    return Formatter.createLogEntry(this.severity, Object.assign({
      originalUrl: ':url',
      url: ':url',
      statusCode: ':status',
      method: ':method',
      timeTakenMs: ':response-time'
    }, formatters));
  }

  getFileName() {
    return this.severity === Logger.Severity.ERROR ?
      Logger.errorFileName :
      Logger.defaultFileName;
  }

  createTransport() {
    const usedTransports = [];

    if (this.options.logToFile) {
      let fileName = this.getFileName();
      Transport.File(path.join(this.logPath, fileName));
    }

    if (this.options.logToConsole) {
      usedTransports.push(Transport.Console());
    }

    this.transport = Transport.create(usedTransports);
  }

  logEntry(type, args) {
    if (!args.length) {
      return;
    }

    const timeStr = chalk.cyan('[' + TimeUtil.showTime() + ']');

    if (typeof args[0] == 'string') {
      args[0] = `${timeStr} ${args[0]}`;
    } else {
      args.unshift(timeStr);
    }

    console[type](...args);
  }

  info(...args) {
    this.logEntry('info', args);
  }

  error(...args) {
    this.logEntry('error', args);
  }

  logAccess(message) {
    return this.transport.info(message);
  }

  logError(message) {
    return this.transport.error(message);
  }

  static createRequestLogger(logDirPath, applicationId, options) {
    const logger = new Logger(logDirPath, options);
    const logMessage = logger.accessLogEntry(options.formatters);

    return morgan(JSON.stringify(logMessage), {
      stream: {
        write(message) {
          logger.logAccess(message);
        }
      }
    });
  }

  static createInfoLogger() {
    const winston = require('winston');

    const {
      combine, colorize, printf, timestamp, align,
    } = winston.format;

    const logTransports = [
      new winston.transports.Console({
        level: 'debug',
        format: combine(
          colorize(),
          timestamp(),
          align(),
          printf(info => `${info.timestamp} ${info.level}: ${info.message}`),
        ),
      }),
    ];

    return winston.createLogger({
      level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
      transports: logTransports,
    });
  }

  static createErrorLogger(logDirPath, applicationId, options) {
    const logger = new Logger(logDirPath, options);

    return function logError(err, req, res, next) {
      const logMessage = Formatter.createErrorLogEntry(err, options.formatters);
      const formatted = JSON.stringify(logMessage);

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

    };
  }
}

module.exports = Logger;
