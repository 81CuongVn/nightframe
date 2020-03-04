const path = require('path');
const express = require('express');
const helmet = require('helmet');
const chalk = require('chalk');
const morgan = require('morgan');

const RouteLoader = require('./route-loader.js');
const Logger = require('./logger.js');

class Application {
  static get ROUTES_BASE_FOLDER() {
    return 'routes';
  }

  constructor() {
    this.__app = express();
    this.__appSettings = require('./app-settings.js');
  }

  /**
   * @override
   * @return {*}
   */
  get globalRequestHandler() {
    return {
      beforeRequest(req, res) {},

      afterRequest(req, res, next) {}
    }
  }

  init() {
    this
      .applySettings()
      .setupSecuritySettings()
      .setupExpressMiddleware()
      .setupRequestLogging()
      .setupRoutes()
      .setupWebpackDevMiddleware()
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
    if (bodyParser) {
      const parser = require('body-parser');

      Object.keys(bodyParser).forEach(type => {
        this.app.use(parser[type](bodyParser[type]));
      })
    }

    const {cookieSecret} = this.settings.app;
    if (cookieSecret) {
      const cookieParser = require('cookie-parser');
      this.app.use(cookieParser(cookieSecret));
    }

    this.app.disable('x-powered-by');

    return this;
  }

  setupWebpackDevMiddleware() {
    if (this.settings.webpack && this.app.get('env') == 'development') {
      this.__appSettings.mergeWebpackSettings();

      const webpack = require('webpack');
      const webpackDevMiddleware = require('webpack-dev-middleware');
      const compiler = webpack(this.settings.webpack);

      this.app.use(webpackDevMiddleware(compiler, {
        publicPath: this.settings.webpack.output.publicPath
      }));
    }

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

      referrerPolicy: {
        policy: 'no-referrer'
      },

      noCache: enableCaching,

      hidePoweredBy: true,
    }));

    return this;
  }

  /**
   * Setup request logging.
   *
   * @private
   */
  setupRequestLogging() {
    if (this.settings.logging.file.enable) {
      let requestLogger = Logger.createRequestLogger(this.settings.logging.file.folder, this.settings.app.name, {
        logToConsole: false
      });

      this.app.use(requestLogger);
    }

    if (this.settings.logging.console) {
      this.app.use(morgan('dev'));
    }

    this.logger = Logger.createInfoLogger();

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

    this.errorLogger = Logger.createErrorLogger(this.settings.logging.file.folder, this.settings.app.name, {
      logToConsole: true,
      severity: 'ERROR'
    });

    this.app.use((err, req, res, next) => {
      this.errorLogger(err, req, res, next);
    });

    this.app.use((err, req, res, next) => {
      if (this.settings.logging.console) {
        console.error(err.stack);
      }

      let statusCode = err.statusCode || 500;
      res.status(statusCode);

      const message = err.errorMsg || 'Internal Server Error';
      const status = err.errorCode || -1;

      this.renderErrorResponse({
        error: err.error || message,
        status,
        message
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

    return this;
  }
}

module.exports = Application;
