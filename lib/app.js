const path = require('path');
const express = require('express');
const helmet = require('helmet');
const chalk = require('chalk');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

const RouteLoader = require('./route-loader.js');
const AppSettings = require('./app-settings.js');
const Logger = require('./logger.js');

class Application {
  static get ROUTES_BASE_FOLDER() {
    return 'routes';
  }

  constructor() {
    this.__app = express();
    this.__appSettings = new AppSettings();
  }

  /**
   * @override
   * @return {*}
   */
  get globalRequestHandler() {
    return {
      beforeRequest(req, res) {},

      handleRequest(result, req, res, next) {
        return Promise.resolve(result);
      }
    }
  }

  init() {
    return new Promise((resolve, reject) => {
      try {
        this
          .applySettings()
          .setupSecuritySettings()
          .setupRequestLogging()
          .setupRoutes()
          .setupExpressMiddleware()
          .setupWebpackDevMiddleware()
          .setupErrorHandling();
      } catch (err) {
        return reject(err);
      }

      return resolve(this);
    });
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
    if (!this.settings.logging.coloring) {
      chalk.level = 0;
    }

    return this;
  }

  /**
   * Setup common express middleware used.
   */
  setupExpressMiddleware() {
    this.app.enable('trust proxy');

    let bodySizeLimit = this.settings.app.bodySizeLimit;
    this.app.use(bodyParser.urlencoded({limit: bodySizeLimit, extended: true}));
    this.app.use(bodyParser.json({limit: bodySizeLimit}));
    this.app.use(bodyParser.text({limit: bodySizeLimit}));

    let cookieSecret = this.settings.app.cookieSecret;
    this.app.use(cookieParser(cookieSecret));

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
    let enableCaching = this.settings.app.enableCaching;

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

    let errorLogger = Logger.createErrorLogger(this.settings.logging.file.folder, this.settings.app.name, {
      logToConsole: true,
      severity: 'ERROR'
    });

    this.app.use(function (err, req, res, next) {
      errorLogger(err, req, res, next);
    });

    this.app.use((err, req, res, next) => {
      if (this.settings.logging.console) {
        console.error(err);
      }

      let statusCode = err.statusCode || 500;
      res.status(statusCode);

      this.renderErrorResponse({
        statusCode: statusCode,
        error: '500 Internal Server Error'
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