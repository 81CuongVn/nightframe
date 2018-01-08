class Controller {
  render(res, view, opts) {
    return new Promise((resolve, reject) => {
      res.render(view, opts, function(err) {
        if (err) {
          return reject(err);
        }

        resolve();
      });
    });
  }
}

module.exports = Controller;