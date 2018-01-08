const express = require('express');
const path = require('path');
const mkdirp = require('mkdirp');
const fs = require('fs');

const Utils = require('../util/utils.js');

const __controller_cache = {};

class RouteLoader {
  static get HTTP_VERBS() {
    return ['get', 'post', 'put', 'delete', 'head', 'patch', 'options', 'all'];
  }

  static get FILE_EXT() {
    return '.js';
  }

  static get HOME_ROUTES_FOLDER() {
    return 'index';
  }

  constructor(routesDir, appInstance) {
    if (!Utils.dirExistsSync(routesDir)) {
      mkdirp.sync(routesDir);
    }

    this.routesDir = routesDir;
    this.settings = appInstance.settings;
    this.globalRequestHandler = appInstance.globalRequestHandler;
  }

  load() {
    let controllers = this.walkSync(this.routesDir);

    return controllers.map(controller => {
      return this.createRouter(controller);
    });
  }

  walkSync(dir, opts = {baseUri: ['/']}, results = []) {
    let list = fs.readdirSync(dir);
    let pending = list.length;

    if (pending === 0) {
      return results;
    }

    list.forEach(resource => {
      let resourcePath = path.join(dir, resource);
      let stat = fs.statSync(resourcePath);

      if (stat && stat.isDirectory()) {
        let options = Object.assign({}, opts);
        options.baseUri = [].concat(opts.baseUri);
        if (resource !== RouteLoader.HOME_ROUTES_FOLDER) {
          options.baseUri.push(resource);
        }

        this.walkSync(resourcePath, options, results);
        pending = pending - 1;
      } else {
        let controllerName = path.basename(resource, RouteLoader.FILE_EXT);
        let controller = this.loadController(resourcePath, controllerName, opts.baseUri);
        if (controller !== false) {
          results.push({
            resource: controller,
            uri: opts.baseUri
          });
        }

        pending = pending - 1;
      }
    });

    return results;
  }

  static isPrivateController(name) {
    return name && name.startsWith('_');
  }

  loadController(resource, name, uri) {
    if (RouteLoader.isPrivateController(name)) {
      return false;
    }

    let ControllerClass;

    try {
      ControllerClass = require(resource);
    } catch (e) {
      console.error(e.stack);
      throw new Error(`Controller cannot be loaded using location: ${resource}`);
    }

    if (!RouteLoader.isES6Class(ControllerClass)) {
      throw new Error('Controllers must be defined ES6 classes.');
    }

    let key = `${uri.join('/')}/${name}`;
    if (__controller_cache[key]) {
      return __controller_cache[key];
    }

    let instance = new ControllerClass(this.settings);
    let methods = RouteLoader.getMethodNames(instance);

    __controller_cache[key] = {name, methods, ControllerClass};

    return __controller_cache[key];
  }

  static getMethodNames(instance) {
    let methodNames = RouteLoader.getAllMethodNames(instance);
    let methods = [];

    methodNames.forEach(methodName => {
      let httpMethod;
      let route = null;
      let parts = methodName.split(/(?:\s+)/);

      if (parts.length > 1) { // 'get /projects/:id' OR 'get projectsById'
        httpMethod = parts[0];
        if (parts[1].startsWith('/')) {
          route = parts[1];
        }
      } else if (parts[0].startsWith('/')) { // '/projects/:id' - assumes http GET by default
        route = parts[0];
      } else {
        parts = methodName.split(/(?=[A-Z])/);
        httpMethod = parts[0];
      }

      methods.push({httpMethod, methodName, route});
    });

    return methods;
  }

  static getAllMethodNames(instance) {
    let methods = [];

    while ((instance = Reflect.getPrototypeOf(instance))) {
      let keys = Reflect.ownKeys(instance);

      keys.forEach((k) => {
        let isValid = RouteLoader.HTTP_VERBS.some(verb => {
          return k.startsWith(verb);
        });

        if (instance[k] instanceof Function && isValid) {
          methods.push(k);
        }
      });
    }

    return methods;
  }

  static isES6Class(resource) {
    return /^class\s/.test(resource.toString());
  }

  static isRouteUriStrict(methodDefinition) {
    return methodDefinition.route && methodDefinition.route.startsWith('^/');
  }

  static computeRouteUri(baseUri, methodDefinition, controllerName) {
    let routeUrl = [baseUri];
    if (controllerName !== 'index') {
      routeUrl.push(controllerName);
    }

    if (RouteLoader.isRouteUriStrict(methodDefinition)) {
      routeUrl = [methodDefinition.route.substring(1)];
    } else if (methodDefinition.route) {
      routeUrl.push(methodDefinition.route);
    }

    return routeUrl.join('/').replace(/(\/\/)/g, '/');
  }

  createRouter(definition) {
    let router = new express.Router();
    let baseUri = definition.uri.join('/');
    let controller = definition.resource;

    controller.methods.forEach(method => {

      let uri = RouteLoader.computeRouteUri(baseUri, method, controller.name);

      router[method.httpMethod](uri, (req, res, next) => {
        req.startTime = new Date();

        let controllerRequestHandler = controller.ControllerClass.globalRequestHandler || {};
        if (typeof controllerRequestHandler == 'function') {
          controllerRequestHandler = controllerRequestHandler(req, res);
        }

        let beforeReq = (controllerRequestHandler.beforeRequest || this.globalRequestHandler.beforeRequest)(req, res);
        if (!(beforeReq instanceof Promise)) {
          beforeReq = Promise.resolve(beforeReq);
        }

        beforeReq
          .then(beforeResult => {
            let instance = new controller.ControllerClass(req, res, this.settings, beforeResult);

            return instance[method.methodName](req, res, next);
          })
          .then(result => {
            let handler = controllerRequestHandler.handleRequest || this.globalRequestHandler.handleRequest;

            return handler(result, req, res, next);
          })
          .then(result => {
            this.handleRequest(result, req, res, next);
          })
          .catch(err => {
            next(err);
          });
      });
    });

    return router;
  }

  handleRequest(result, req, res, next) {
    if (!res.headersSent) {
      if (!result || !(result instanceof Promise)) {
        result = Promise.resolve(result);
      }

      result.then(data => {
        if (!res.headersSent && data && typeof data == 'object') {
          res.json(data);
        }
      });
    }
  }
}

module.exports = RouteLoader;