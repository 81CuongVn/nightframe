const createError = require('http-errors');
const path = require('path');
const AppSettings = require('./lib/app-settings.js').settings;
const Application = require('./lib/app.js');
const Controller = require('./lib/controller.js');
const RouteLoader = require('./lib/route-loader.js');
const Logger = require('./lib/logger.js');

module.exports = {
  HttpError: createError,
  createError,
  Application,
  AppSettings,
  Controller,
  RouteLoader,

  common: {
    settings: AppSettings,
    require(file) {
      return require(path.join(process.cwd(), file));
    }
  },
  logger: Logger.createInfoLogger()
};
