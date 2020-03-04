const defaultsDeep = require('lodash.defaultsdeep');
const mergeObjects = require('lodash.merge');
const path = require('path');
const dotenv = require('dotenv');

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
    return 'nightframe.json';
  }

  static get CONFIG_JS_FILE() {
    return 'nightframe.conf.js';
  }

  static loadConfig() {
    const localJsonFile = path.join(process.cwd(), AppSettings.CONFIG_JSON_FILE);

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

  getEnvFile() {
    let envFile = `.env${this.appEnv !== 'default' ? ('.' + this.appEnv): ''}`;
    if (!Utils.fileExistsSync(path.join(process.cwd(), envFile))) {
      envFile = path.join(process.cwd(), '.env');
    }

    return envFile;
  }

  adaptSettings() {
    dotenv.config({
      path: this.getEnvFile()
    });

    this.inheritFromDefaultEnv();
    this.replaceEnvVariables(this.settings);
  }

  inheritFromDefaultEnv() {
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
          target[key] = target[key].replace(/\$\{(\w+),?([^}]*)\}/g, function(match, varName, defaultVal) {
            if (process.env[varName] === undefined || process.env[varName] === null) {
              if (defaultVal !== undefined) {
                return defaultVal;
              }

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

let instance_;

module.exports = new (function() {
  if (!instance_) {
    instance_ = new AppSettings();
  }

  return instance_;
})();
