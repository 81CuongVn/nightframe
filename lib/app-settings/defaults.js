module.exports = {
  host: 'localhost',
  port: 3000,
  logging: {
    file: {
      enable: false,
      folder: null
    },

    coloring: true,
    console: true
  },

  app: {
    name: '',
    cookieSecret: '${APP_SETTINGS_COOKIE_SECRET}',
    sessionSecret: '${APP_SETTINGS_SESSION_SECRET}',
    bodySizeLimit: '10mb',
    enableCaching: false
  }
};