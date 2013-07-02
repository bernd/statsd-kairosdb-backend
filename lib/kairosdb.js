/*
 * Flush stats to KairosDB (https://code.google.com/p/kairosdb/)
 *
 * This backend sends a metric to KairosDB for every metric received via the
 * statsd protocol. There is no aggregation.
 *
 * To enable this backend, include 'statsd-kairosdb-backend' in the backends
 * configuration array:
 *
 *   backends: ['statsd-kairosdb-backend']
 *
 * The backend will read the configuration options from the following
 * 'kairosdb' hash defined in the main statsd config file:
 *
 * kairosdb: {
 *   host: 'localhost',      // KairosDB host. (default localhost)
 *   port: 4242,             // KairosDB port. (default 4242)
 *   reconnectInterval: 1000 // KairosDB reconnect interval. (default 1000)
 * }
 *
 */
var net = require('net'),
    util = require('util');

function KairosdbBackend(startupTime, config, events) {
  var self = this;

  self.defaultHost = '127.0.0.1';
  self.defaultPort = 4242;
  self.defaultReconnectInterval = 1000;
  self.host = self.defaultHost;
  self.port = self.defaultPort;
  self.reconnectInterval = self.defaultReconnectInterval;
  self.debug = config.debug;

  if (config.kairosdb) {
    self.host = config.kairosdb.host || self.defaultHost;
    self.port = config.kairosdb.port || self.defaultPort;
    self.reconnectInterval = config.kairosdb.reconnectInterval || self.defaultReconnectInterval;
  }

  self.kairosdbConnected = false;
  self.notifiedNoConnection = false;

  self.kairosdb = self.dbConnect();

  events.on('packet', function (packet, rinfo) {
    try {
      if (self.kairosdbConnected) {
        self.process(packet, rinfo);
      } else {
        if (!self.notifiedNoConnection) {
          self.notifiedNoConnection = true;
          self.log('Not connected yet.');
        }
      }
    } catch (e) {
      self.log(e);
    }
  });
}

KairosdbBackend.prototype.dbConnect= function () {
  var self = this,
      host = self.host,
      port = self.port,
      conn = net.createConnection({host: host, port: port});

  conn.on('error', function (e) {
    self.log(e);
    self.kairosdbConnected = false;

    setTimeout(function () {
      self.kairosdb = self.dbConnect();
    }, self.reconnectInterval);
  });

  conn.on('connect', function () {
    self.kairosdbConnected = true;
    self.notifiedNoConnection = false;

    self.log('Connected to ' + [host, port].join(':'));
  });

  return conn;
}

KairosdbBackend.prototype.log = function (msg) {
  util.log('[KairosDB] ' + msg);
}

KairosdbBackend.prototype.send = function (ts, key, value, client) {
  var self = this,
      statString = ['put', key, ts, value].join(' ');

  statString += " client=" + client;
  statString += " source=statsd";

  if (self.debug) {
    self.log(statString);
  }

  self.kairosdb.write(statString + "\n");
}

KairosdbBackend.prototype.process = function (packet, rinfo) {
  var self = this,
      ts = Math.round(new Date().getTime() / 1000),
      client = rinfo.address;

  /* From stats.js. */
  var packet_data = packet.toString();

  if (packet_data.indexOf("\n") > -1) {
    var metrics = packet_data.split("\n");
  } else {
    var metrics = [ packet_data ] ;
  }

  for (var midx in metrics) {
    if (metrics[midx].length === 0) {
      continue;
    }
    var bits = metrics[midx].toString().split(':');
    var key = bits.shift()
      .replace(/\s+/g, '_')
      .replace(/\//g, '-')
      .replace(/[^a-zA-Z_\-0-9\.]/g, '');

    if (bits.length === 0) {
      bits.push("1");
    }

    for (var i = 0; i < bits.length; i++) {
      var fields = bits[i].split("|");
      if (fields[1] === undefined) {
        self.log('Bad line: ' + fields + ' in msg "' + metrics[midx] +'"');
        continue;
      }
      var metric_type = fields[1].trim();
      if (metric_type === "ms") {
        self.send(ts, key, Number(fields[0] || 0), client);
      } else if (metric_type === "g") {
        if (fields[0].match(/^[-+]/)) {
          self.log('Sending gauges with +/- is not supported yet.');
        } else {
          self.send(ts, key, Number(fields[0] || 0), client);
        }
      } else if (metric_type === "s") {
        self.log('Sets not supported yet.');
      } else {
        self.send(ts, key, Number(fields[0] || 1), client);
      }
    }
  }
}

exports.init = function (startupTime, config, events) {
  var kairosdb = new KairosdbBackend(startupTime, config, events);

  return true;
}
