class Formatter {
  static createLogEntry(severity, logProps) {
    return Object.assign({
      type: ':status',
      correlationId: ':correlationId',
      service: ':applicationId',
      version: ':applicationVersion',
      userAgent: ':user-agent',
      httpVersion: ':httpVersion',
      dateTime: ':date[iso]',
      contentLength: ':res[content-length]',
      requestId: ':requestId',
      traceId: ':traceId'
    }, logProps);
  }

  static createErrorLogEntry(err, formatters = {}) {
    let errorMessage = '';

    if (typeof err.stack == 'string') {
      let parts = err.stack.split('\n');
      errorMessage += parts[0];
      if (parts[1]) {
        errorMessage += parts[1];
      }

      errorMessage = errorMessage.replace(/:/g, '|');
    }

    let message = '';
    if (err.message && err.path) { // template rendering exceptions
      let sections = err.message.split('\n');
      message = `Error while parsing ${err.path} - ${sections[sections.length - 1]}`;
    } else {
      message = err.message || '';
    }

    const data = Object.assign({
      service: ':applicationId',
      version: ':applicationVersion',
      dateTime: ':date[iso]',
      requestId: err.requestId ? err.requestId : ':requestId',
      traceId: err.traceId ? err.traceId : ':traceId',
      url: ':url',
      via: err.via ? err.via : ':via',
      type: String(err.status || err.statusCode || 500),
    }, formatters);

    if (errorMessage) {
      data.error = errorMessage;
    } else if (message) {
      message = message.replace(/:/g, '|');
      data.error = message;
    }

    return data;
  }
}

module.exports = Formatter;
