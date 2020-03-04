const assert = require('assert');
const common = require('../../common.js');
const AppSettings = common.require('app-settings.js');

describe('app-settings tests', function() {

  const {settings} = AppSettings;

  it('test replace env variables', function() {
    assert.strictEqual(settings.app.environment, 'dev');
    assert.strictEqual(settings['test-config'], 'default-value');
  });

});
