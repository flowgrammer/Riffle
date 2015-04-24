/*global window, module, setInterval, console, define, exports, toString */
/* riffle splits execution across iterations of the event loop, and maintains order of executed functions.
   http://www.nczonline.net/blog/2009/01/13/speed-up-your-javascript-part-1/
*/

"use strict";

// TODO necessary for browser?
var global = typeof(window) !== 'undefined' ? window : global;

// indexOf browser polyfill from mdn for ie7 and ie8
if (!Array.prototype.indexOf) {
  Array.prototype.indexOf = function (searchElement, fromIndex) {
    if ( this === undefined || this === null ) {
      throw new TypeError( '"this" is null or not defined' );
    }
    var length = this.length >>> 0; // Hack to convert object.length to a UInt32

    fromIndex = +fromIndex || 0;

    if (Math.abs(fromIndex) === Infinity) {
      fromIndex = 0;
    }
    if (fromIndex < 0) {
      fromIndex += length;
      if (fromIndex < 0) {
        fromIndex = 0;
      }
    }
    for (;fromIndex < length; fromIndex++) {
      if (this[fromIndex] === searchElement) {
        return fromIndex;
      }
    }
    return -1;
  };
}

// local-scope underscore polyfill so riffle can be standalone
// TODO underscore major version changes
var _ = _ || {
  breaker: {},
  ctor: function ctor() {},
  arrayProto: Array.prototype,
  objProto: Object.prototype,
  functionProto: Function.prototype,
  listen: function listen(event, el, callback) {
    /* cross-browser addEvent */
    if (el.addEventListener) { // W3C DOM
      el.addEventListener(event, callback, false);
    } else if (el.attachEvent) { // IE DOM
      el.attachEvent("on" + event, callback);
    }
  },
  isString: function (obj) {
    return toString.call(obj) == '[object String]';
  },
  isArray: Array.isArray || function isArray(obj) {
    return _.objProto.toString.call(obj) === '[object Array]';
  },
  isObject: function isObject(obj) {
    return obj === Object(obj);
  },
  isFunction: function isFunction(obj) {
    return _.objProto.toString.call(obj) === '[object Function]';
  },
  isUndefined: function isUndefined(obj) {
    return obj === void 0;
  },
  bind: function bind(func, context) {
    var bound, args;
    if (func.bind === _.functionProto.bind && _.functionProto.bind) {
      return _.functionProto.apply(func, _.arrayProto.slice.call(arguments, 1));
    }
    if (!_.isFunction(func)) {
      throw new TypeError();
    }
    args = _.arrayProto.slice.call(arguments, 2);
    bound = function () {
      if (!(this instanceof bound)) {
        return func.apply(context, args.concat(_.arrayProto.slice.call(arguments)));
      }
      _.ctor.prototype = func.prototype;
      var self = new _.ctor(),
          result = func.apply(self, args.concat(_.arrayProto.slice.call(arguments)));
      if (_.isObject(result)) {
        return result;
      }
      return self;
    };
    return bound;
  },
  each: function each(obj, iterator, context) {
    var i, l, key;
    if (obj == null) {
      return;
    }
    if (_.arrayProto.forEach && obj.forEach === _.arrayProto.forEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (i = 0, l = obj.length; i < l; i += 1) {
        if (obj.hasOwnProperty(i) && iterator.call(context, obj[i], i, obj) === _.breaker) {
          return;
        }
      }
    } else {
      for (key in obj) {
        if (obj.hasOwnProperty(key)) {
          if (iterator.call(context, obj[key], key, obj) === _.breaker) {
            return;
          }
        }
      }
    }
  },
  map: function map(obj, iterator, context) {
    var results = [];
    if (obj == null) {
      return results;
    }
    if (_.arrayProto.map && obj.map === _.arrayProto.map) {
      return obj.map(iterator, context);
    }
    _.each(obj, function (value, index, list) {
      results[results.length] = iterator.call(context, value, index, list);
    });
    if (obj.length === +obj.length) {
      results.length = obj.length;
    }
    return results;
  },
  reduce: function reduce(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) {
      obj = [];
    }
    if (_.arrayProto.reduce && obj.reduce === _.arrayProto.reduce) {
      if (context) {
        iterator = _.bind(iterator, context);
      }
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    _.each(obj, function (value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) {
      throw new TypeError('Reduce of empty array with no initial value');
    }
    return memo;
  },
  reject: function reject(obj, iterator, context) {
    var results = [];
    if (obj == null) {
      return results;
    }
    _.each(obj, function exclude(value, index, list) {
      if (!iterator.call(context, value, index, list)) {
        results[results.length] = value;
      }
    });
    return results;
  },
  range: function (start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var length = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(length);

    while(idx < length) {
      range[idx++] = start;
      start += step;
    }

    return range;
  }
};

var applyArgsToFn = function (fn, args) {
  fn.apply(global, args); // throws exception if apply fails
};
var assertFunction = function (f) {
  if (!_.isFunction(f)) {
    throw new Error('expecting function');
  }
};
var arrayify = function (obj) { return (_.isArray(obj) && obj) || [obj]; };
var removeItem = function (list, item) {
  return _.reject(list, function (listItem) {
    return item === listItem;
  });
};
var tick = /* call the function in the next event loop iteration */ function (fn) {
  return global.setImmediate ? global.setImmediate(fn) : global.setTimeout(fn, 0);
};
var hookFn = /* make a function to store hooks in some list */ function (list, returnVal) {
  return function (f) {
    assertFunction(f);
    list.push(f);
    return returnVal;
  };
};
var unhookFn = /* make a function to remove hooks from a list */ function (list, returnVal) {
  return function (f) {
    assertFunction(f);
    var idx = list.indexOf(f);
    if (idx > -1) {
      list.splice(idx, 1);
    }
    return returnVal;
  };
};
var outputAllHooks = function (lists, val) {
  // requires list of lists, TODO inflexible
  var hooks = _.reduce(lists, function (allLists, list) { return allLists.concat(list); }, []);
  _.each(hooks, function (hook) { hook(val); });
};

var riffleCount = 0;

var riffle = /* collection of stream utilities and hooks for a stream system */ function () {
  var riffleId = riffleCount++;
  var streamCount = 0;
  /* hooks called for this collection of streams */
  var createHooks = [], invokeHooks = [], outputHooks = [], inputHooks = [], unInputHooks = [];
  var stream = function (/* optional */ streamFn) { /* construct a stream */
    var id = streamCount++;
    /* hooks for just this stream */
    var localInvokeHooks = [], localOutputHooks = [];
    var chain = {
      _id: function () { return riffleId + '-' + id; }
    };
    var debugFn;
    outputAllHooks([createHooks], {id: chain._id()});
    (function () {
      /* outputFns are the downstream streamFns, hooked via their input function.
       They're called when this streamFn's out function is called. */
      var outputFns = [];
      /* true if outputFns are called in the next tick of the event loop */
      var isAsync = true;
      streamFn = (_.isFunction(streamFn) && streamFn) || function (outFn, arg) {
        applyArgsToFn(outFn, [arg]);
      };
      var outputAllFns = function /* first argument to streams, outputs all hooks */ (arg) {
        outputAllHooks([outputHooks, localOutputHooks], {
          id: chain._id(),
          args: [arg]
        });
        /* outputFns populated in hooks */
        _.each(outputFns, function (f) {
          if (isAsync) {
            tick(function () {
              applyArgsToFn(f, [arg]);
            });
          } else {
            // this is good for debugging because it exposes the call stack
            applyArgsToFn(f, [arg]);
          }
        });
      };
      chain.invoke = /* invoke a stream directly (can also invoke via inputs) */ function () {
        var outputs = [].slice.call(arguments);
        outputAllHooks([invokeHooks, localInvokeHooks], {
          id: chain._id(),
          args: outputs // todo clone
        });
        outputs.unshift(outputAllFns);

        applyArgsToFn((_.isFunction(debugFn) && debugFn) || streamFn, outputs);
        return chain;
      };
      chain.isAsync = /* invoke ticks (true, default), or uses same call stack */ function (isIt) {
        isAsync = isIt;
        return chain;
      };
      chain.debug = /* hot-swap stream body */ function (newDebugFn) {
        debugFn = (_.isFunction(newDebugFn) && newDebugFn) || ((newDebugFn !== null) && debugFn);
      };
      /* _onOutput gets just the output value,
       onOutput gets the stream id, and args array with the output value */
      chain._onOutput = hookFn(outputFns, chain);
      chain._offOutput = unhookFn(outputFns, chain);
      chain.onOutput = hookFn(localOutputHooks, chain);
      chain.offOutput = unhookFn(localOutputHooks, chain);
      chain.onInvoke = hookFn(localInvokeHooks, chain);
      chain.offInvoke = unhookFn(localInvokeHooks, chain);
    }());

    /*
     s.input([s1, s2])
     s.input(s3, 1)
     s.unInput(s1)
     */
    (function () {
      var inputStreams = [];
      var invokers = [];
      var localInputHooks = [],
          localUnInputHooks = [];
      var pairs = {};
      var filterStreams = function (array) {
        return _.reject(array, function (obj) { return !stream.isStream(obj); });
      };
      var inputIdxAtIdx = function (input, idx) {
        if (inputStreams.length <= idx || !inputStreams[idx]) { return -1; }
        return inputStreams[idx].indexOf(input);
      };
      var inputFn = function (callback) {
        return function (inputs, portIdx) { return callback(filterStreams(arrayify(inputs)), portIdx || 0); };
      };
      chain.input = inputFn(function (inputs, /* optional */ idx) {
        var invokeOneArg = function (x) {
          var outputs = [];
          outputs[idx] = x;
          chain.invoke.apply(global, outputs);
        };
        _.each(inputs, function registerOnOutput(input) {
          if (inputIdxAtIdx(input, idx) !== -1) { return; }
          input._onOutput(invokeOneArg);
          // union with existing
          inputStreams[idx] = inputStreams[idx] || [];
          inputStreams[idx].push(input);
          invokers[idx] = invokers[idx] || [];
          invokers[idx].push(invokeOneArg);
          pairs[chain._id()] = pairs[chain._id()] || [];
          pairs[chain._id()].push(input._id());
          outputAllHooks([inputHooks, localInputHooks], {
            id: chain._id(),
            portId: idx,
            inputId: input._id(),
            ports: _.map(inputStreams, function (port, idx) {
              if (!_.isObject(port)) { return {id: idx}; }
              return {
                id: idx,
                parentId: chain._id(),
                links: {
                  target: chain._id(),
                  streams: _.map(port, function (s) { return s._id(); })
                }
              };
            })
          });
        });
        return chain;
      });
      chain.unInput = inputFn(function (inputs, idx) {
        _.each(inputs, function (input) {
          var streamIdx = inputIdxAtIdx(input, idx);
          if (streamIdx < 0) { return; }
          var invoker = invokers[idx][streamIdx];
          input._offOutput(invoker);
          invokers[idx] = removeItem(invokers[idx], invoker);
          inputStreams[idx] = removeItem(inputStreams[idx], input);
          if (_.isArray(pairs[chain._id()])) {
            pairs[chain._id()] = removeItem(pairs[chain._id()], input._id());
          }
          outputAllHooks([unInputHooks, localUnInputHooks], {
            id: chain._id(),
            portId: idx,
            inputId: input._id(),
            ports: _.map(inputStreams, function (port, idx) {
              if (!_.isObject(port)) { return {id: idx}; }
              return {
                id: idx,
                parentId: chain._id(),
                links: {
                  target: chain._id(),
                  streams: _.map(port, function (s) { return s._id(); })
                }
              };
            })
          });
        });
        return chain;
      });
      chain.isInput = function (input) {
        return pairs[chain._id()].indexOf(input._id()) > -1;
      };
      chain.onInput = hookFn(localInputHooks, chain);
      chain.offInput = unhookFn(localInputHooks, chain);
      chain.onUnInput = hookFn(localUnInputHooks, chain);
      chain.offUnInput = unhookFn(localUnInputHooks, chain);
    }());

    return chain;
  };

  stream.onCreate = hookFn(createHooks, stream);
  stream.offCreate = unhookFn(createHooks, stream);
  stream.onInvoke = hookFn(invokeHooks, stream);
  stream.offInvoke = unhookFn(invokeHooks, stream);
  stream.onOutput = hookFn(outputHooks, stream);
  stream.offOutput = unhookFn(outputHooks, stream);
  stream.onInput = hookFn(inputHooks, stream);
  stream.offInput = unhookFn(inputHooks, stream);
  stream.onUnInput = hookFn(unInputHooks, stream);
  stream.offUnInput = unhookFn(unInputHooks, stream);

  stream.isStream = function isStream(x) {
    return !!(x && x.invoke && x.onOutput && x.offOutput && x.input && x.unInput);
  };

  stream.join = function (/* optional */ func, /* optional */ config) {
    /* a special stream that saves the most recent arguments for an index
     and waits for them all to arrive before invoking.
     both what is saved and what permits invoking are configurable */
    var saved = [];
    config = (!_.isFunction(func) && !_.isArray(func) && _.isObject(func) && func) || config || {};
    func = (_.isFunction(func) && func) || function (out) /* default stream function */ {
      applyArgsToFn(out, [].slice.call(arguments, 1));
    };
    config.saver = (_.isFunction(config.saver) && config.saver) || function (saved, newStuff) {
      return _.map(_.range(Math.max((saved || []).length, (newStuff || []).length, func.length - 1)), function (item, i) {
        return !_.isUndefined(newStuff[i]) ? newStuff[i] : saved[i];
      });
    };
    config.canInvoke = (_.isFunction(config.canInvoke) && config.canInvoke) || function (saved) {
      return saved.length === _.reduce(saved, function (memo, item) {
        return memo + (_.isUndefined(item) ? 0 : 1);
      }, 0);
    };
    config.invokeWith = (_.isFunction(config.invokeWith) && config.invokeWith) || function (saved) {
      return saved;
    };
    return stream(function (out) {
      var items = [].slice.call(arguments, 1);
      // TODO clone saved?
      saved = config.saver(saved, items);
      if (config.canInvoke(saved, items)) {
        applyArgsToFn(func, [out].concat(arrayify(config.invokeWith(saved, items))));
      };
    });
  };

  stream.any = function (func, config) {
    config = config || {};
    config.canInvoke = config.canInvoke || function () { return true; };
    return stream.join(func, config);
  };

  // output a not-undefined value on input, defaults to true
  stream.emit = function (obj) {
    return stream(function (out) { out(!_.isUndefined(obj) ? obj : true); });
  };

  var funcBuilder = function (config) {
    return function (fn) {
      return function () {
        var returnVal = stream();
        // TODO fix and test
        stream.join(config).invoke.apply(global, arguments)._onOutput(function () {
          var result = fn.apply(global, arguments);
          var binding = stream.isStream(result) ? 'input' : 'invoke';
          returnVal[binding](result);
        });
        return returnVal;
      };
    };
  };

  /* converts non-stream functions to stream functions
   The idea here is that it's easier to compose and rearrange reactive computations with functions:
   f(g(h(i)))
   than composing with stream api:
   f.input(g.input(h.input(i)))
   The case for functions becomes even more convincing when considering multiple inputs,
   throwaway or otherwise transient dataflows, and various oop and functional programming techniques.
   We also get a bunch of neat combinator calculus stuff for free.
   As tempting as it may be, however, we're trying to avoid academic distractions. ;)
   */
  stream.func = funcBuilder();
  stream.fun = funcBuilder({waitsForAllInputs:false});

  var o = {};
  o.valFactory = function () {
    /*
     val('bar')._onOutput(function (b) {
     console.log(b);
     });
     ...
     val('bar').invoke('bar');
     */
    var CLIENT = "__CLIENT_ONLY__";
    var vals = {};
    var names = {};
    // true if two state objects are the same state
    var same = function (a, b) {
      if (!a || !b) { return false; }
      for (var p in a) {
        if (p.substring(0, 2) === 'is') { return a[p] && b[p]; }
      }
      return false;
    };
    // state object to minimize shared state
    var state = function (name, obj) {
      var out = {};
      out['is' + name.charAt(0).toUpperCase() + name.slice(1)] = true;
      if (obj && !!obj.val) {
        out.val = obj.val;
      }
      if (obj && !!obj.previousVal) {
        out.previousVal = obj.previousVal;
      }
      if (!obj || (obj.val && !!obj.val.heal && stream.isStream(obj.val.heal)) || 'previousVal' in obj) {
        return out;
      }
      return obj.val;
    };
    return function (name) {
      names[name] = names[name] || stream(function (outFn, val) {
        vals[name] = vals[name] || {val: null, queue:[]};
        var v = vals[name];
        var wait;
        // console.log("1", val, name);
        v.queue.push(val);
        if (v.queue.length > 1) { return; }
        var restart = function () {
          /* if existing value is a module, shut it down first. */
          var prev = v.val;
          var isPrevHealable = !!(prev && prev.heal && stream.isStream(prev.heal));
          prev = (isPrevHealable && prev) || {heal: stream()};
          var next = v.queue[0];
          var isNextHealable = !!(next && next.heal && stream.isStream(next.heal));
          next = (isNextHealable && next) || {heal: stream()};
          var prevFinish = prev.onHeal || prev.heal;
          var nextFinish = next.onHeal || next.heal;
          var start = stream(function (out, status) {
            if (!same(status, wait)) { return; }
            wait = state('starting', { previousVal: v.val });
            if (isNextHealable) {
              outFn({target: CLIENT, val: state('starting', { previousVal: v.val })});
            }
            out(state('starting', { previousVal: v.val }));
          });
          var started = stream(function (out, status) {
            if (!same(status, wait)) { return; }
            wait = state('started', { val: v.queue[0] });
            // if (name === 'pushstate/url') {console.log(v.queue[0]); }
            v.val = v.queue[0];
            outFn({target: CLIENT, val: state('started', { val: v.queue[0] })});
            v.queue.shift();
            o.split([prevFinish, start, next.heal]);
            o.split([nextFinish, started]);
            if (v.queue.length) { restart(); } // TODO setTimeout to avoid stackoverflow
          });
          o.splice([prevFinish, start, next.heal]);
          o.splice([nextFinish, started]);
          /* wait is here to let heal functions output sloppily 
           This, in effect, allows us to ignore duplicate state transition
           so heal streams can be identity over their first port
           */
          wait = state('stopping');
          if (isPrevHealable) {
            outFn({target: CLIENT, val: state('stopping')});
          }
          prev.heal.invoke(state('stopping'));
        };
        restart();
      });
      /* make new client for every name reference
       this is a stream so multiple functions can react to changes in state
       and so dependences can each trigger changes in state independently
       */
      var client = stream(function (outFn, msg) {
        // console.log("2", msg, name);
        // if (name === 'pushstate/url') { console.log('shi', name, msg); }
        if (msg && msg.target && msg.target === CLIENT) {
          // console.log('4', name, msg.val);
          return outFn(msg.val);
        }
        return names[name].invoke(msg);
      });
      /* reference vals after they've been set */
      // console.log('after', vals, name); //vals[name], vals[name].val, vals[name].queue);
      if (vals && vals[name] && vals[name].val && !vals[name].queue.length) {
        // console.log('after2', name, vals[name].val);
        setTimeout(function () {
          // if (name === 'matrix' || name === 'doc') { console.log("3", name); debugger; }
          client.invoke({target: CLIENT, val: state('started', { val: vals[name].val })});
        }, 0);
      }
      // TODO don't allow repeat provides, should unProvide first
      o.splice([names[name], client]);
      client.vals = vals;
      client.names = names;
      client._name = name;
      client._bus = function () { return names[name]; }; // to unbind if necessary
      client.get = function () { return vals[name].val; }; // for runtime hackability
      return client;
    };
  };
  o.timerFactory = function (factoryTimeout) {
    var timerId;
    var timeout = factoryTimeout || 1000;
    var tickFn = function (outFn, newTimeout) {
      timeout = newTimeout || timeout;
      if (timerId || timeout === Infinity) {
        clearInterval(timerId);
      }
      if (timeout === Infinity) { return; }
      timerId = setTimeout(function () {
        outFn((new Date()));
        tickFn(outFn, timeout);
      }, timeout);
    };
    return stream(tickFn);
  };
  o.logFactory = function (factoryMsg /* 'What's up' */ ) {
    return stream(function (outFn, msg) {
      console.log(factoryMsg || msg || 'logger created at ' + Date.now());
      var args = [].slice.call(arguments);
      args.shift();
      outFn.apply(this, args); // for logging connections between 
    });
  };
  o.lockServer = function (lock /* function (prevArgs, args) { return true; } */ ) {
    /*
     By default, the lock function waits for an input on the second argument
     signaling that the locked process is finished
     unlocking can be signaled by the process itself, the client initiating the locking,
     or some other source.
     The lock function may be specified when locking depends on signals from many sources
     or complex unlocking logic is necessary.
     */
    lock = lock || function (prevArgs, args) { return !!args[1]; };
    var currentId = 1; // 1-index to remain truthy
    var lastId = 1; // increment tickets to prevent starvation
    var prevArgs = [];
    var api = {
      send: stream(function (outFn, msg) {
        var args = [].slice.call(arguments);
        var isLocked = lock(prevArgs, args);
        var isLockingMessage = msg && _.has(msg, 'id') && (!_.has(msg, 'ticketId') || !msg.ticketId);

        // store prevArgs by including newest arg
        while (args.length < prevArgs.length) { args.push(null); }
        while (prevArgs.length < args.length) { prevArgs.push(null); }
        prevArgs = _.map(args, function (x, i) { return !!x ? x : prevArgs[i]; });

        if (isLockingMessage) {
          /*
           If we see a message with an id but no ticket,
           we assume the id is a new client wanting a ticket number.
           Once the number is minted, we notify clients of the assignment.
           */
          api.events.invoke({id: msg.id, ticketId: lastId});
          if (lastId === 1) {
            api.events.invoke({serving: currentId});
          }
          lastId++;
        } else if (msg && msg.ticketId === currentId) {
          /*
           If we see a message marked with the current id, we can send the message
           */
          outFn(msg.msg);
          api.sent.invoke(msg); // alternate interface
          api.events.invoke({served: currentId, msg: msg, id: msg.id});
        }

        // open the lock for the next client
        if (!isLocked) {
          currentId++;
          api.events.invoke({serving: currentId});
        }
      }),
      events: stream(),
      sent: stream()
    };
    return api;
  };
  o.lockClient = function (lock) {
    /*
     Implements http://en.wikipedia.org/wiki/Ticket_lock for Riffle streams,
     basically an asynchronously-driven spin lock,
     where each new client is served in the order it got a ticket.

     By default, tickets increment when the locked process signals its completion.
     It signals completion by messaging port 2 of the lock, like so:
     ```
     lock.input(processDone, 2);
     processDone.invoke(true);
     ```
     locks can pass a custom function to increment the ticket instead of the default mechanism.

     Here's an example of connecting a client to the lock. This is done for every client.
     ```
     // setup a client to poll a locked interface until it opens
     var c = lockClient(lock);
     // send messages to the lock. takes turns with other clients
     c.send.invoke({status: "fml"});
     ```
     There's a built-in queue, so consumers can fire-and-forget
     Alternately, consumers can respond to signals from the `sent` stream
     The client can also notify consumers when messages were sent with c.sent
     this allows for the consumer to open a connection with one message
     and then send a series of subsequent messages
     avoiding problems associated with state changing while waiting on a lock
     */
    var queue = [];
    var isTargetServing = true;
    var ticketId;
    var clientId = Math.floor(Math.random() * (1e8 - 1e7 + 1)) + 1e7;
    var getMsg = function () {
      return {msg: queue[0], id: clientId, ticketId: ticketId};
    };
    var api = {
      send: stream(function (outFn, msg) {
        queue.push(msg);
        // politely avoid spamming the target
        // this is not completely necessary and possibly inefficient and error-prone
        ((!ticketId || isTargetServing) && outFn(getMsg()));
      }),
      sent: stream()
    };
    var onEvent = stream(function (outFn, msg) {
      if (_.has(msg, 'id') && msg.id === clientId && !!msg.ticketId) {
        ticketId = msg.ticketId;
      } else if (_.has(msg, 'serving') && msg.serving === ticketId) { // \o/ YIPPEE!
        isTargetServing = true;
        (queue.length && outFn(getMsg()));
      } else if (_.has(msg, 'served') && msg.served === ticketId) { // \o/ YATTA!
        queue.shift();
        api.sent.invoke();
        (queue.length && outFn(getMsg()));
      } else if (_.has(msg, 'serving') && msg.serving !== ticketId) {
        isTargetServing = false;
        ticketId = null;
      }
      // otherwise msg was meant for another client
    });
    lock.send.input([api.send, onEvent]);
    onEvent.input(lock.events);
    return api;
  };
  o.splice = function (streams /* [streamA, streamB, [streamC, portIdx] */) {
    streams = streams.concat([]);
    var x = streams.shift();
    var xs = streams;
    _.each(xs, function (s) {
      if (_.isArray(s)) {
        s[0].input(x, s[1]);
        x = s[0];
        return;
      } else if (!!s) {
        s.input(x);
      }
      x = s;
    });
  };
  o.split = function (streams) {
    streams = streams.concat([]);
    var x = streams.shift();
    var xs = streams;
    _.each(xs, function (s) {
      if (_.isArray(s)) {
        s[0].unInput(x, s[1]);
        x = s[0];
        return;
      } else if (!!s) {
        s.unInput(x);
      }
      x = s;
    });
  };
  o.spliceMask = function (pipe, m) {
    // spliceMask([o.loadTimer, o.load, matrix && matrix.instance.drawLock.lock], [isOn, isOn, isMatrixOn]);
    var mask = function (a, mask) {
      /* TODO mask length */
      return _.map(a, function (a, i) { return (mask[i] && a) || null; });
    };
    o.split(pipe);
    o.splice(mask(pipe, m));
  };
  o.pipe = function (vars, graph) {
    // TODO validate graph string syntax
    var pave = function (obj, addr) {
      var parts = (addr || '').split('.'), part;
      while (parts.length) {
        part = parts.shift();
        obj = (part in (obj || {}) && obj[part]) || null;
      }
      return obj;
    };
    _.each(graph.split(/\s*,\s*/), function (pipeline) {
      var ops = pipeline.match(/[|>]/g);
      if (!ops.length) { throw "No operators found in pipe: " + pipeline; }
      var streams = pipeline.split(/\s*[|>]\s*/);
      var x = streams.shift().split(/\s*:\s*/);
      var xs = streams;
      _.each(xs, function (s, idx) {
        s = s.split(/\s*:\s*/);
        var sDef = pave(vars, s[0]), xDef = pave(vars, x[0]);
        // if s[1] is num, it specifies ports
        if (s.length && sDef) { sDef = [sDef, parseInt(s[1], 10)]; }
        o.split([xDef, sDef]);
        if (ops[idx] === '>') {
          o.splice([xDef, sDef]);
        }
        x = s;
      });
    });
  };

  o.val = o.valFactory(); // this is globally exposed for modules and global values

  stream.lib = o;

  return stream;
};

// by default we only want to work with one stream system
var stream = riffle();

/*
 we hide the ability to create new stream systems
 the main difference here is that the streams have a riffle prefix in their ids
 so multiple stream systems can have independent ids
 and also the global hooks are isolated to the stream system
 */
stream._create = riffle;

module.exports = stream;
