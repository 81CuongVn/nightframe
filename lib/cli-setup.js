const path = require('path');
const chalk = require('chalk');
const minimist = require('minimist');

module.exports = new (function () {
  /**
   * Based on https://github.com/substack/node-optimist by
   *  James Halliday (mail@substack.net), which has been deprecated
   */
  class CliSetup {
    get argv() {
      const argv = minimist(this.__processArgs, this.options);
      argv.$0 = this.$0;

      if (this.demanded._ && argv._.length < this.demanded._) {
        this.fail(`Not enough non-option arguments: got ${argv._.length}, need at least ${this.demanded._}`);
      }

      const missing = [];
      Object.keys(this.demanded).forEach(function (key) {
        if (!argv[key]) {
          missing.push(key);
        }
      });

      if (missing.length) {
        this.fail('Missing required arguments: ' + missing.join(', '));
      }

      return argv;
    }

    constructor(processArgs, cwd = process.cwd()) {
      this.options = {
        alias: {},
        default: {}
      };

      this.__processArgs = processArgs;
      this.usage = null;
      this.demanded = {};
      this.descriptions = {};

      this.$0 = process.argv.slice(0, 2)
        .map(function (x) {
          const b = rebase(cwd, x);

          return x.match(/^\//) && b.length < x.length ? b : x;
        }).join(' ');

      if (process.env._ !== undefined && process.argv[1] === process.env._) {
        this.$0 = process.env._.replace(path.dirname(process.execPath) + '/', '');
      }
      this.setup();
      this.setUsage(`Usage: ${chalk.blueBright('$0 [source] [options]')}`);
    }

    addDefault(key, value) {
      if (typeof key === 'object') {
        Object.keys(key).forEach((k) => {
          this.addDefault(k, key[k]);
        });
      } else {
        this.options.default[key] = value;
      }

      return this;
    }

    isDefault(option, value) {
      return this.options.default[option] && this.options.default[option] === value;
    }

    getDefault(option) {
      return this.options.default[option];
    }

    alias(x, y) {
      if (typeof x === 'object') {
        Object.keys(x).forEach((key) => {
          this.alias(key, x[key]);
        });
      } else {
        this.options.alias[x] = (this.options.alias[x] || []).concat(y);
      }

      return this;
    }

    demand(keys) {
      if (typeof keys == 'number') {
        if (!this.demanded._) {
          this.demanded._ = 0;
        }
        this.demanded._ += keys;
      } else if (Array.isArray(keys)) {
        keys.forEach((key) => {
          this.demand(key);
        });
      } else {
        this.demanded[keys] = true;
      }

      return this;
    }

    setUsage(msg) {
      this.usage = msg;

      return this;
    }

    describe(key, desc, groupName) {
      if (typeof key === 'object') {
        Object.keys(key).forEach((k) => {
          this.describe(k, key[k], groupName);
        });
      } else {
        this.descriptions[key] = {desc, groupName};
      }

      return this;
    }

    option(key, opt) {
      if (typeof key === 'object') {
        Object.keys(key).forEach((k) => {
          this.option(k, key[k]);
        });
      } else {
        if (opt.alias) {
          this.alias(key, opt.alias);
        }

        if (opt.demand) {
          this.demand(key);
        }

        if (typeof opt.defaults !== 'undefined') {
          this.addDefault(key, opt.defaults);
        }

        const desc = opt.describe || opt.description || opt.desc;
        if (desc) {
          this.describe(key, desc, opt.group);
        }
      }

      return this;
    }

    showHelp(fn) {
      if (!fn) {
        fn = console.error;
      }

      fn(this.help());
    }

    help() {
      const keys = Object.keys(this.descriptions);
      const groups = Object.keys(this.descriptions).reduce((prev, key) => {
        const group = this.descriptions[key].groupName || 'Options';
        prev[group] = prev[group] || [];
        prev[group].push(key);

        return prev;
      }, {});

      const help = [];

      if (this.usage) {
        help.unshift(this.usage.replace(/\$0/g, this.$0), '');
      }

      const switches = keys.reduce((acc, key) => {
        acc[key] = [key].concat(this.options.alias[key] || [])
          .map(function (sw) {
            return (sw.length > 1 ? '--' : '-') + sw;
          })
          .join(', ');

        return acc;
      }, {});

      const switchlen = longest(Object.keys(switches).map(function (s) {
        return switches[s] || '';
      }));

      const desclen = longest(Object.keys(this.descriptions).map((d) => {
        return this.descriptions[d].desc || '';
      }));

      Object.keys(groups).forEach((groupName, index) => {
        const content = ['\n'];
        content.push(chalk.greenBright(groupName + ':'));

        groups[groupName].forEach(key => {
          const kswitch = switches[key];
          let desc = this.descriptions[key].desc || '';
          const spadding = new Array(Math.max(switchlen - kswitch.length + 3, 0)).join('.');
          const dpadding = new Array(Math.max(desclen - desc.length + 1, 0)).join(' ');

          if (dpadding.length > 0) {
            desc += dpadding;
          }

          let prelude = '  ' + (kswitch) + ' ' + chalk.grey(spadding);

          let extra = [
            this.demanded[key]
              ? '[required]'
              : null,
            this.options.default[key] !== undefined
              ? '[default: ' + JSON.stringify(this.options.default[key]) + ']'
              : null
            ,
          ].filter(Boolean).join('  ');

          let body = [desc, extra].filter(Boolean).join('  ');

          content.push(prelude + ' ' + chalk.grey(body));
        });

        help.push(content.join('\n'));
      });

      help.push('\n');

      return help.join('');
    }

    fail(msg) {
      if (msg) {
        console.error(chalk.redBright(msg) + '\n');
      }

      this.showHelp();

      process.exit(1);
    }

    setup() {
      // CLI definitions
      this.option('source', {
        string: true
      });

      this.option('port', {
        description: 'Port number for the server to listen to (default is 3000).',
        alias: 'p'
      });

      // $ nightwatch -e
      // $ nightwatch --env saucelabs
      this.option('env', {
        description: 'Specify the testing environment to use (\'default\').',
        alias: 'e'
      });

      // $ nightwatch -c
      // $ nightwatch --config
      this.option('config', {
        description: 'Path to configuration file; nightframe.conf.js or nightframe.json are read by default if present.',
        alias: 'c'
      });

      this.option('enable-e2e-testing', {
        description: 'Enable mocking of api endpoints and services to use with end-to-end testing.'
      });

      // $ nightwatch --verbose
      this.option('verbose', {
        description: 'Enable extended HTTP logging to console.'
      });

      // $ nightwatch -h
      // $ nightwatch --help
      this.option('help', {
        description: 'Shows this help (pass COLORS=0 env variable to disable colors).',
        alias: 'h'
      });

      // $ nightwatch --info
      this.option('info', {
        description: 'Shows environment info, i.e. OS, cpu, Node.js and installed browsers.'
      });

      // $ nightwatch -v
      // $ nightwatch --version
      this.option('version', {
        alias: 'v',
        description: 'Shows version information.'
      });

      return this;
    }
  }

  function longest(xs) {
    return Math.max.apply(null, xs.map(x => x.length));
  }

  function rebase(base, dir) {
    let ds = path.normalize(dir).split('/').slice(1);
    let bs = path.normalize(base).split('/').slice(1);

    for (var i = 0; ds[i] && ds[i] === bs[i]; i++) {
      ;
    }
    ds.splice(0, i);
    bs.splice(0, i);

    const p = path.normalize(bs.map(function () {
      return '..';
    }).concat(ds).join('/')).replace(/\/$/, '').replace(/^$/, '.');

    return p.match(/^[./]/) ? p : './' + p;
  }

  let __instance__;

  if (!__instance__) {
    __instance__ = new CliSetup(process.argv.slice(2));
  }

  return __instance__;
})();
