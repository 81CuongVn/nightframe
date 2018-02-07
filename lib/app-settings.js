const defaultsDeep = require('lodash.defaultsdeep');
const mergeObjects = require('lodash.merge');
const path = require('path');
const chalk = require('chalk');
const Utils = require('../util/utils.js');
const Defaults = require('./app-settings/defaults.js');

class AppSettings {
  static get SECRET_PROPERTIES() {
    return [
      'cookieSecret',
      'sessionSecret'
    ];
  }

  static get DEFAULT_ENV() {
    return 'default';
  }

  static get CONFIG_JSON_FILE() {
    return 'app-settings.json';
  }

  static get CONFIG_JS_FILE() {
    return 'app-settings.conf.js';
  }

  static loadConfig() {
    let localJsonFile = path.join(process.cwd(), AppSettings.CONFIG_JSON_FILE);

    if (Utils.fileExistsSync(localJsonFile)) {
      return require(localJsonFile);
    }

    let localJsFile = path.join(process.cwd(), AppSettings.CONFIG_JS_FILE);
    if (Utils.fileExistsSync(localJsFile)) {
      return require(localJsFile);
    }

    throw new Error(`Missing application settings file. Please make sure you have either ${chalk.bold(AppSettings.CONFIG_JSON_FILE)} or ${chalk.bold(AppSettings.CONFIG_JS_FILE)} defined in the current folder.`)
  }

  constructor() {
    this.appEnv = null;
    this.settings = Object.assign({}, Defaults);

    this.baseConfig = AppSettings.loadConfig();
    this.setCurrentEnv();
    this.adaptSettings();
  }

  setCurrentEnv() {
    this.appEnv = typeof process.env.NODE_ENV == 'string' ? process.env.NODE_ENV : AppSettings.DEFAULT_ENV;

    let availableEnvs = Object.keys(this.baseConfig).reduce((prev, key) => {
      if (typeof this.baseConfig[key] == 'object' && this.baseConfig[key]) {
        prev.push(key);
      }

      return prev;
    }, []);

    if (availableEnvs.indexOf(this.appEnv) < 0) {
      throw new Error(`Invalid environment specified: ${this.appEnv}; check NODE_ENV environment variable. Available environments are: ${availableEnvs.join(', ')}`);
    }

    return this;
  }

  adaptSettings() {
    this.inheritFromDefaultEnv();
    this.replaceEnvVariables(this.settings);
  }

  inheritFromDefaultEnv() {
    if (this.appEnv === AppSettings.DEFAULT_ENV) {
      return this;
    }

    let envSettings = this.baseConfig[this.appEnv];
    let defaultEnvSettings = this.baseConfig[AppSettings.DEFAULT_ENV] || {};
    defaultsDeep(envSettings, defaultEnvSettings);

    mergeObjects(this.settings, envSettings);

    return this;
  }

  mergeWebpackSettings() {
    if (this.settings.webpack) {
      const config = require('../build/webpack.config.js');
      this.settings.webpack = mergeObjects({}, config, this.settings.webpack);
    }
  }

  /**
   * Looks for pattern ${VAR_NAME} in settings
   * @param {Object} [target]
   */
  replaceEnvVariables(target) {
    for (const key in target) {
      switch (typeof target[key]) {
        case 'object':
          this.replaceEnvVariables(target[key]);
          break;

        case 'string':
          target[key] = target[key].replace(/\$\{(\w+)\}/g, function(match, varName) {

            if (process.env[varName] === undefined || process.env[varName] === null) {
              return '';
            }

            return process.env[varName];
          });
          break;
      }
    }

    return this;
  }
}

module.exports = AppSettings;