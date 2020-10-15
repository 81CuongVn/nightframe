const express = require('express');
const path = require('path');
const mkdirp = require('mkdirp');
const fs = require('fs');

const Utils = require('../util/utils.js');

const __apiMocks__ = [];

class RouteLoader {
  static get apiMocks() {
    return __apiMocks__;
  }

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

  static getAllPropertyNames(obj) {
    const result = new Set();

    while (obj) {
      Object.getOwnPropertyNames(obj).forEach(p => result.add(p));
      obj = Object.getPrototypeOf(obj);
    }

    return [...result];
  }

  static getAllMethodNames(ControllerClass) {
    const methods = [];
    const reserved = ['beforeRequest', 'afterRequest'];

    try {
      const keys = RouteLoader.getAllPropertyNames(ControllerClass.prototype);
      keys.forEach((k) => {
        const isValid = RouteLoader.HTTP_VERBS.some(verb => k.startsWith(`${verb} `));
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

  static addApiMock(mockItem) {
    __apiMocks__.push(mockItem);
  }

  constructor(routesDir, appInstance) {
    if (!Utils.dirExistsSync(routesDir)) {
      mkdirp.sync(routesDir);
    }

    this.routesDir = routesDir;
    this.settings = appInstance.settings;
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

  async initController(ControllerClass, {req, res, next}, ...args) {
    try {
      const {settings} = this;

      class Controller extends ControllerClass {
        get settings() {
          return settings;
        }
      }

      return new Controller(req, res, next, ...args);
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
          if (this.settings.e2eTestingMode) {
            const mockedItem = findMockedRequest(req);

            console.log('FOUND mock for', req.url, mockedItem);
            if (mockedItem !== null) {
              if (!mockedItem.persist) {
                console.log('Mock for ', req.url, 'removed');
                removeMock(mockedItem);
              }

              res.statusCode = mockedItem.statusCode;
              res.json(mockedItem.response);

              return;
            }
          }

          const instance = await this.initController(ControllerClass, {req, res, next});
          if (!instance) {
            return;
          }

          if (instance.beforeRequest) {
            await instance.beforeRequest(req, res, next);
          }

          const result = await instance[method.methodName](req, res, next);

          if (instance.afterRequest) {
            await instance.afterRequest(result, req, res, next);
          }

          await this.handleRequest(result, req, res, next);
        } catch (err) {
          this.handleError(err, req, res, next);
        }
      });
    });

    return router;
  }

  handleError(err, req, res, next) {
    next(err);
  }

  async handleRequest(result, req, res, next) {
    if (res.headersSent) {
      return;
    }

    let data;
    if (result instanceof Promise) {
      data = await result;
    } else {
      data = result;
    }

    if (data && typeof data == 'object') {
      res.json(data);
    } else {
      res.send(data || '');
    }

  }
}

const removeMock = (mock) => {
  const normalizedPostData = mock.postdata && normalizeJSONString(mock.postdata);
  const mockMethod = mock.method || 'get';

  for (let i = 0; i < RouteLoader.apiMocks.length; i++) {
    let item = RouteLoader.apiMocks[i];

    if (
      item.url === mock.url && item.method.toLowerCase() === mockMethod.toLowerCase() &&
      (!mock.postdata || isPostDataEqual(item.postdata, normalizedPostData, item.matchEmpty))
    ) {
      RouteLoader.apiMocks.splice(i, 1);
      break;
    }
  }
};

const findMockedRequest = (req) => {
  const postdata = req.body ? normalizeJSONString(req.body) : null;

  for (let i = 0; i < RouteLoader.apiMocks.length; i++) {
    let item = RouteLoader.apiMocks[i];

    item.postdata = item.postdata || '';
    item.method = item.method || 'GET';

    if (item.url === req.url && item.method.toLowerCase() === req.method.toLowerCase()) {
      item.statusCode = item.statusCode || 200;
      item.responseHeaders = item.responseHeaders || {};
      item.response = item.response || '';

      if (!item.postdata) {
        return item;
      }

      if (postdata && isPostDataEqual(item.postdata, postdata, item.matchEmpty)) {
        return item;
      }

      if (!postdata) {
        return item;
      }
    }
  }

  return null;
};

const isPostDataEqual = (notNormalizedData, normalizedData, matchEmpty = false) => {
  let normalized;

  if (typeof notNormalizedData == 'string') {
    normalized = normalizeJSONString(notNormalizedData);
  } else if (typeof notNormalizedData == 'object') {
    normalized = JSON.stringify(notNormalizedData);
  }

  const postDataEquals = normalizedData === normalized;
  if (matchEmpty && !postDataEquals) {
    const incomingPostData = JSON.parse(normalized);
    const matchData = JSON.parse(normalizedData);

    return objectIncludes(matchData, incomingPostData);
  }

  return postDataEquals;
};

const objectIncludes = (target, source) => {
  return Object.keys(target).every(function(key) {
    if (!(key in source)) {
      return false;
    }

    if (source[key] && typeof source[key] == 'object') {
      return objectIncludes(target[key], source[key]);
    }

    return (target[key] === source[key] || source[key] === '');
  });
};

const normalizeJSONString = (data) => {
  try {
    if (typeof data == 'string') {
      return JSON.stringify(JSON.parse(data));
    }

    return JSON.stringify(data);
  } catch (err) {
    console.error('Unabled to parse: "', data, '"');
    console.error(err);
  }
};

module.exports = RouteLoader;
