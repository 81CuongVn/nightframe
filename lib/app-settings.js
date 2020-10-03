const defaultsDeep = require('lodash.defaultsdeep');
const mergeObjects = require('lodash.merge');
const path = require('path');
const dotenv = require('dotenv');

const chalk = require('chalk');
const Utils = require('../util/utils.js');
const Defaults = require('./app-settings/defaults.js');
const {argv} = require('../lib/cli-setup.js');

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

  constructor() {
    this.appEnv = null;
    this.settings = Object.assign({}, Defaults);

    this.baseConfig = this.loadConfig();
    this.setCurrentEnv();
    this.adaptSettings();
  }

  loadConfig() {
    if (argv.config) {
      this.configFile = path.resolve(argv.config);
    } else {
      const localJsonFile = path.join(process.cwd(), AppSettings.CONFIG_JSON_FILE);

      if (Utils.fileExistsSync(localJsonFile)) {
        this.configFile = localJsonFile;
      } else {
        let localJsFile = path.join(process.cwd(), AppSettings.CONFIG_JS_FILE);
        if (Utils.fileExistsSync(localJsFile)) {
          this.configFile = localJsFile;
        }
      }
    }

    if (this.configFile) {
      return require(this.configFile);
    }

    throw new Error(`Missing application settings file. Please make sure you have either ${chalk.bold(AppSettings.CONFIG_JSON_FILE)} or ${chalk.bold(AppSettings.CONFIG_JS_FILE)} defined in the current folder.`);
  }

  setCurrentEnv() {
    this.appEnv = argv.env || (typeof process.env.NODE_ENV == 'string' ? process.env.NODE_ENV : AppSettings.DEFAULT_ENV);

    const availableEnvs = Object.keys(this.baseConfig).reduce((prev, key) => {
      if (typeof this.baseConfig[key] == 'object' && this.baseConfig[key]) {
        prev.push(key);
      }

      return prev;
    }, []);

    if (availableEnvs.indexOf(this.appEnv) < 0) {
      throw new Error(`Invalid environment specified: ${this.appEnv}; check --env argument or NODE_ENV environment variable. Available environments are: ${availableEnvs.join(', ')}`);
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

    if (argv['enable-e2e-testing']) {
      this.settings.e2eTestingMode = true;
    }

    this.inheritFromDefaultEnv();
    this.replaceEnvVariables(this.settings);
  }

  inheritFromDefaultEnv() {
    const envSettings = this.baseConfig[this.appEnv];
    const defaultEnvSettings = this.baseConfig[AppSettings.DEFAULT_ENV] || {};
    defaultsDeep(envSettings, defaultEnvSettings);
    mergeObjects(this.settings, envSettings);

    return this;
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
