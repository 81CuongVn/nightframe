const morgan = require('morgan');
const uuid = require('uuid');

class Formatter {
  static createLogEntry(severity, logProps) {
    return Object.assign({
      correlationId: ':correlationId',
      referrer: ':referrer',
      initiator: ':initiator',
      severity: severity,
      service: ':applicationId',
      logger: ':issuer',
      version: ':applicationVersion',
      userAgent: ':user-agent',
      httpVersion: ':http-version',
      dateTime: ':date[iso]',
      contentLength: ':res[content-length]',
      userId: ':userId'
    }, logProps);
  }

  static createErrorLogEntry(err) {
    let errorMessage = '';

    if (typeof err.stack == 'string') {
      let parts = err.stack.split('\n');
      errorMessage += parts[0];
      if (parts[1]) {
        errorMessage += parts[1];
      }

      errorMessage = errorMessage.replace(/:/g, '|')
    }

    let message;
    if (err.message && err.path) { // template rendering exceptions
      let sections = err.message.split('\n');
      message = `Error while parsing ${err.path} - ${sections[sections.length - 1]}`;
    } else {
      message = err.message;
    }

    message = message.replace(/:/g, '|');

    return {
      message,
      service: ':applicationId',
      version: ':applicationVersion',
      dateTime: ':date[iso]',
      userId: ':userId',
      logger: ':issuer',
      type: String(err.status || err.statusCode || 500),
      error: errorMessage
    };
  }

  static defineTokens(applicationId, options = {}) {
    morgan
      .token('correlationId', req => {
        return req.headers['x-correlation-id'] || uuid.v4();
      })
      .token('referrer', req => {
        return req.headers['x-user-agent'] || '';
      })
      .token('initiator', req => {
        return req.headers['x-initiator'] || applicationId;
      })
      .token('userId', req => {
        return req.headers['x-user-id'] || '';
      })
      .token('applicationId', req => {
        return applicationId;
      })
      .token('issuer', req => {
        return process.argv[1];
      })
      .token('applicationVersion', req => {
        return options.version || null;
      })
      .token('uri', req => {
        return req.protocol + '://' + req.get('host') + req.originalUrl;
      })
  }
}

module.exports = Formatter;
