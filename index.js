const AppSettings = require('./lib/app-settings.js').settings;
const Application = require('./lib/app.js');
const Controller = require('./lib/controller.js');
const RouteLoader = require('./lib/route-loader.js');
const Logger = require('./lib/logger.js');

module.exports = {
  Application,
  AppSettings,
  Controller,
  RouteLoader,
  logger: Logger.createInfoLogger()
};
