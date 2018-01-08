const http = require('http');
const chalk = require('chalk');
const TimeUtil = require('../util/time.js');

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
    if (this.settings.port) {
      val = this.settings.port;
    } else if (process.env.PORT) {
      val = process.env.PORT;
    } else {
      val = AppServer.DEFAULT_PORT;
    }

    let port = parseInt(val, 10);

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
    if (this.port === false) {
      throw new Error(`Invalid port number specified: ${this.port}.`);
    }

    this.instance.listen(this.port)
      .on('error', err => {
        switch (err.code) {
          case 'EACCES':
            throw new Error(`[${err.code}] Error - port requires elevated privileges.`);

          case 'EADDRINUSE':
            throw new Error(`[${err.code}] Error - ${this.port} is already in use.`);

          default:
            throw err;
        }
      })
      .on('listening', () => {
        let addr = this.instance.address();
        let bind = typeof addr === 'string'
          ? 'pipe ' + addr
          : 'port ' + addr.port;

        /* eslint-disable no-console */
        console.info(`${chalk.cyan(`[${TimeUtil.showTime()}]`)} ${this.settings.app.name} application is listening on ${bind} in ${chalk.blueBright(process.env.NODE_ENV)} mode.`);
      })
      .on('close', () => {
        console.error('Server stopped');
      });

    return this;
  }
}

module.exports = AppServer;