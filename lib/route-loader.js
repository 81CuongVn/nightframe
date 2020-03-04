const express = require('express');
const path = require('path');
const mkdirp = require('mkdirp');
const fs = require('fs');

const Utils = require('../util/utils.js');

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

  static isPrivateController(name) {
    return name && name.startsWith('_');
  }

  static getMethodNames(ControllerClass) {
    let methodNames = RouteLoader.getAllMethodNames(ControllerClass);
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

  static getAllMethodNames(ControllerClass) {
    const methods = [];
    const reserved = ['beforeRequest', 'afterRequest'];

    try {
      const keys = Object.getOwnPropertyNames(ControllerClass.prototype);
      keys.forEach((k) => {
        const isValid = RouteLoader.HTTP_VERBS.some(verb => k.startsWith(verb));
        if ((ControllerClass.prototype[k] instanceof Function) && isValid && !reserved.includes(k)) {
          methods.push(k);
        }
      });
    } catch (err) {
      console.error(err.stack);
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

    return controllers.map(controller => this.createRouter(controller));
  }

  loadController(resource, name) {
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

    return ControllerClass;
  }

  async initController(ControllerClass, {req, res, next}) {
    try {
      const {settings} = this;

      class Controller extends ControllerClass {
        get settings() {
          return settings;
        }
      }

      return new Controller(req, res, next);
    } catch (err) {
      next(err);

      return null;
    }
  }

  walkSync(dir, opts = {baseUri: ['/']}, results = []) {
    let list = fs.readdirSync(dir);
    let pending = list.length;

    if (pending === 0) {
      return results;
    }

    list.forEach(resource => {
      const resourcePath = path.join(dir, resource);
      const stat = fs.statSync(resourcePath);

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

        const ControllerClass = this.loadController(resourcePath, controllerName, opts.baseUri);
        if (ControllerClass) {
          results.push({
            resource: ControllerClass,
            uri: opts.baseUri,
            name: controllerName
          });
        }

        pending = pending - 1;
      }
    });

    return results;
  }

  createRouter(definition) {
    const router = new express.Router();
    const baseUri = definition.uri.join('/');
    const ControllerClass = definition.resource;
    const methods = RouteLoader.getMethodNames(ControllerClass);

    methods.forEach(method => {
      const uri = RouteLoader.computeRouteUri(baseUri, method, definition.name);
      router[method.httpMethod](uri, async (req, res, next) => {
        req.startTime = new Date();

        try {
          const instance = await this.initController(ControllerClass, {req, res, next});
          if (!instance) {
            return;
          }

          if (instance.beforeRequest) {
            await instance.beforeRequest(req, res, next);
          }

          let result = await instance[method.methodName](req, res, next);

          if (instance.afterRequest) {
            await instance.afterRequest(req, res, next);
          }

          await this.handleRequest(result, req, res, next);
        } catch (err) {
          next(err);
        }
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
        if (res.headersSent) {
          return;
        }

        if (data && typeof data == 'object') {
          res.json(data);
        } else {
          res.send(data || '');
        }
      });
    }
  }
}

module.exports = RouteLoader;
