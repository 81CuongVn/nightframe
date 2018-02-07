const webpack = require('webpack');
const chalk = require('chalk');

module.exports = function(config) {
  webpack(config).run(function (err, stats) {
    if (err) { // so a fatal error occurred. Stop here.
      console.error(chalk.red(err));

      return 1;
    }

    const jsonStats = stats.toJson();

    if (jsonStats.hasErrors) {
      return jsonStats.errors.map(function (error) {
        console.error(error);
      });
    }

    if (jsonStats.hasWarnings) {
      console.log(chalk.yellow('Webpack generated the following warnings: '));
      jsonStats.warnings.map(function (warning) {
        console.warn(warning);
      });
    }

    console.log('Webpack stats:');
    console.log(stats);

    return 0;
  });
};

