const path = require('path');
const express = require('express');
const helmet = require('helmet');
const chalk = require('chalk');
const morgan = require('morgan');

const HttpErrors = require('http-errors');
const RouteLoader = require('./route-loader.js');
const Logger = require('./logger.js');

class Application {
  static get ROUTES_BASE_FOLDER() {
    return 'routes';
  }

  get logFormattingTokens() {
    return {
      userId: req => {
        return '';
      }
    };
  }

  get defaultLogFormattingTokens() {
    return {
      correlationId: req => req.headers['x-correlation-id'] || '',
      requestId: req => req.headers['x-request-id'] || '',
      traceId: req => req.headers['x-trace-id'] || '',
      via: req => req.headers['x-via'] || '',
      userAgent: req => req.headers['user-agent'] || '',
      httpVersion: req=> req.httpVersion,
      userId: req => {
        if (req.user) {
          return req.user.userId;
        }

        return '';
      },
      applicationId: () => this.appPkgInfo.name,
      applicationVersion: () => (this.appPkgInfo.version || null)
    };
  }

  constructor() {
    this.__app = express();
    this.__appSettings = require('./app-settings.js');
  }

  init(argv) {
    try {
      this.appPkgInfo = require(path.resolve('./package.json'));
    } catch (e) {
      this.appPkgInfo = {
        name: this.settings.app.name
      };
    }

    this
      .applySettings(argv)
      .defineLogFormattingTokens()
      .setupSecuritySettings()
      .setupExpressMiddleware()
      .setupRequestLogging()
      .setupRoutes()
      .setupErrorHandling();

    return this;
  }

  /**
   * @type {express}
   * @readonly
   */
  get app() {
    return this.__app;
  }

  /**
   * @type {Object}
   * @readonly
   */
  get settings() {
    return this.__appSettings.settings;
  }

  applySettings() {
    if (!this.settings.logging.colors) {
      chalk.level = 0;
    }

    return this;
  }

  /**
   * Setup common express middleware used.
   */
  setupExpressMiddleware() {
    this.app.enable('trust proxy');

    const {bodyParser} = this.settings.app;
    const parser = require('body-parser');
    if (bodyParser) {
      Object.keys(bodyParser).forEach(type => {
        this.app.use(parser[type](bodyParser[type]));
      });
    } else if (bodyParser === undefined) {
      console.warn('body-parser middleware settings are not defined. Using defaults.');
      //this.app.use(parser.json());
      //this.app.use(parser.urlencoded({extended: false}));
    }

    const {cookieSecret} = this.settings.app;
    if (cookieSecret) {
      const cookieParser = require('cookie-parser');
      this.app.use(cookieParser(cookieSecret));
    }

    this.app.disable('x-powered-by');

    return this;
  }

  /**
   * Setup security settings using helmet.
   *
   * @private
   */
  setupSecuritySettings() {
    const {enableCaching} = this.settings.app;

    this.app.use(helmet({
      frameguard: {
        action: 'sameorigin'
      },
      contentSecurityPolicy: false,

      referrerPolicy: {
        policy: 'no-referrer'
      },

      noCache: enableCaching
    }));

    return this;
  }

  /**
   * Setup request logging.
   *
   * @private
   */
  setupRequestLogging() {
    const {logging} = this.settings;
    const {formatters} = logging;
    const fileEnabled = logging.file.enable || logging.file.enabled;
    const consoleEnabled = logging.console.enable || logging.console.enabled || logging.console === true;
    const logRequests = consoleEnabled && logging.console.requests;

    if (fileEnabled === true || logging.console.requests) {
      const requestLogger = Logger.createRequestLogger(logging.file.folder, this.settings.app.name, {
        logToConsole: logging.console.requests,
        logToFile: fileEnabled,
        formatters
      });

      this.app.use(requestLogger);
    }

    if (consoleEnabled && logRequests) {
      morgan.format('nightframe', function(tokens, req, res) {
        const status = res.headersSent ? res.statusCode : undefined;
        const color = status >= 500 ? 31 // red
          : status >= 400 ? 33 // yellow
            : status >= 300 ? 36 // cyan
              : status >= 200 ? 32 // green
                : 0;

        const fn = morgan.compile(':date[iso] \x1b[36m:method\x1b[0m\t\t:url \x1b[' +
          color + 'm:status \x1b[0m:remote-addr :response-time ms - :res[content-length]\x1b[0m');

        return fn(tokens, req, res);
      });

      this.app.use(morgan('nightframe'));
    }

    this.logger = Logger.createInfoLogger();

    return this;
  }

  defineLogFormattingTokens() {
    const mergedTokens = Object.assign({}, this.defaultLogFormattingTokens, this.logFormattingTokens);

    Object.keys(mergedTokens).forEach(token => {
      morgan.token(token, mergedTokens[token]);
    });

    return this;
  }

  setupErrorHandling() {
    this.app.use((req, res, next) => {
      let statusCode = 404;
      res.status(statusCode);

      this.renderErrorResponse({
        status: statusCode,
        error: '404 Not Found'
      }, req, res);

    });

    const {logging} = this.settings;
    const {formatters} = logging;
    const fileEnabled = logging.file.enable || logging.file.enabled;
    const consoleEnabled = logging.console.enable || logging.console.enabled || logging.console === true;

    const logOpts = {
      logToConsole: consoleEnabled,
      logToFile: fileEnabled === true || fileEnabled === 'ERROR',
      severity: 'ERROR',
      formatters
    };

    this.errorLogger = Logger.createErrorLogger(this.settings.logging.file.folder, this.settings.app.name, logOpts);

    this.app.use((err, req, res, next) => this.errorLogger(err, req, res, next));
    this.app.use((err, req, res, next) => {
      if (consoleEnabled) {
        console.error('Error:', err.stack);
      }

      let statusCode = err.statusCode || 500;
      let errorMessage = 'Internal Server Error';
      if (err.errorMsg) {
        errorMessage = err.errorMsg;
      } else if (statusCode >= 400 && statusCode < 500) {
        errorMessage = err.message;
      }

      res.status(statusCode);

      const status = err.errorCode || -1;

      this.renderErrorResponse({
        error: err.error || '',
        status,
        message: errorMessage
      }, req, res);
    });

    return this;
  }

  renderErrorResponse(data, req, res) {
    if (res.headersSent) {
      return this;
    }

    res.send(data);

    return this;
  }

  setupRoutes() {
    let routesBaseDir = path.join(process.cwd(), Application.ROUTES_BASE_FOLDER);
    let routeLoader = new RouteLoader(routesBaseDir, this);
    let routers = routeLoader.load();

    if (routers.length > 0) {
      this.app.use(...routers);
    }

    if (this.settings.e2eTestingMode) {
      const router = new express.Router();

      router.post('/mocks/api', (req, res, next) => {
        const body = req.body;
        body.persist = body.persist || typeof body.persist == 'undefined';
        RouteLoader.addApiMock(body);

        res.statusCode = 200;
        res.send('');
      });

      router.get('/mocks/api', (req, res, next) => {

        console.log('controllers', RouteLoader.controllerInstances);

        res.statusCode = 200;
        res.send('');
      });

      this.app.use(router);
    }



    return this;
  }
}

module.exports = Application;
