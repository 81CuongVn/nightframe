module.exports = {
  host: 'localhost',
  port: 3000,
  logging: {
    file: {
      enable: false,
      folder: null
    },

    console: {
      enable: true,
      colors: true
    }
  },

  app: {
    name: '',
    cookieSecret: '${COOKIE_SECRET}',
    sessionSecret: '${SESSION_SECRET}',
    bodySizeLimit: '10mb',
    enableCaching: false
  }
};
