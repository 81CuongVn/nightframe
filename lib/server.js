const http = require('http');
const chalk = require('chalk');
const path = require('path');
const logger = require('./logger.js').createInfoLogger();
const {argv} = require('../lib/cli-setup.js');

class AppServer {
  static get DEFAULT_PORT() {
    return 3000;
  }

  /**
   * @param {express} app
   * @param {Object} settings
   */
  constructor(app, settings = {}) {
    this.app = app;
    this.settings = settings;

    this.createServer();
  }

  get instance() {
    return this.__instance;
  }

  get port() {
    let val;
    if (argv.port) {
      val = argv.port;
    } else if (this.settings.port) {
      val = this.settings.port;
    } else if (process.env.PORT) {
      val = process.env.PORT;
    } else {
      val = AppServer.DEFAULT_PORT;
    }

    const port = parseInt(val, 10);

    if (isNaN(port)) {
      // named pipe
      return val;
    }

    if (port >= 0) {
      // port number
      return port;
    }

    return false;
  }

  createServer() {
    this.__instance = http.createServer(this.app);

    return this;
  }

  start() {
    return new Promise((resolve, reject) => {
      if (this.port === false) {
        return reject(new Error(`Invalid port number specified: ${this.port}.`));
      }

      const appSettings = require('./app-settings.js');

      this.instance.listen(this.port)
        .on('error', err => {
          switch (err.code) {
            case 'EACCES':
              return reject(new Error(`[${err.code}] Error - port requires elevated privileges.`));

            case 'EADDRINUSE':
              return reject(new Error(`[${err.code}] Error - ${this.port} is already in use.`));

            default:
              reject(err);
          }
        })
        .on('listening', () => {
          let addr = this.instance.address();
          let bind = typeof addr === 'string'
            ? 'pipe ' + addr
            : 'port ' + addr.port;

          const testingMode = this.settings.e2eTestingMode ? ' in end-to-end testing mode ' : '';
          const cwd = process.cwd();
          let {configFile} = appSettings;

          if (cwd === path.dirname(appSettings.configFile)) {
            configFile = './' + path.basename(appSettings.configFile);
          }

          /* eslint-disable no-console */
          logger.info(`${this.settings.app.name} application is listening on ${bind} in ${chalk.blueBright(appSettings.appEnv)} environment${testingMode} → loaded config from ${chalk.underline.bold(configFile)}.`);

          resolve(this.instance);
        })
        .on('close', () => {
          logger.error('Server stopped');
          resolve(this.instance);
        });
    });
  }
}

module.exports = AppServer;
