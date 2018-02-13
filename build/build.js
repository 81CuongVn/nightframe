const webpack = require('webpack');
const chalk = require('chalk');

module.exports = function(config) {
  /* eslint-disable no-console */
  console.log(chalk.cyan(`Generating Webpack bundle for ${chalk.blueBright(process.env.NODE_ENV)} environment...`));

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
      /* eslint-disable no-console */
      console.log(chalk.yellow('Webpack generated the following warnings: '));
      jsonStats.warnings.map(function (warning) {
        /* eslint-disable no-console */
        console.warn(warning);
      });
    }

    /* eslint-disable no-console */
    console.log(chalk.bold.green('Finished.'));

    return 0;
  });
};
