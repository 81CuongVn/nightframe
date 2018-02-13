const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CleanWebpackPlugin = require('clean-webpack-plugin');
const HtmlWebpackHarddiskPlugin = require('html-webpack-harddisk-plugin');

module.exports = {
  devtool: 'inline-source-map',
  plugins: [
    new CleanWebpackPlugin([path.resolve('dist')], {
      allowExternal: true
    }),
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: '"production"'
      }
    }),
    new HtmlWebpackPlugin({
      alwaysWriteToDisk: true,
      template: path.resolve('views/index.ejs.html'),
      filename: path.resolve('views/index.ejs'),
      inject: 'body',
      hash: true
    }),
    new HtmlWebpackHarddiskPlugin()
  ],
  target: 'web',
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(process.cwd(), 'dist'),
    publicPath: '/'
  }
};
