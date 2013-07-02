StatsD KairosDB backend
-----------------------

This [StatsD](https://github.com/etsy/statsd) backend publishes stats to
a [KairosDB](https://github.com/proofpoint/kairosdb) database instance.

## CAVEAT

This has not been used in production yet! Please be careful!

## Installation

    $ cd /path/to/statsd
    $ npm install statsd-kairosdb-backend

## Configuration

You can configure the following settings in your StatsD config file.

```js
{
  kairosdb: {
    host: 'localhost',
    port: 4242,
    reconnectInterval: 1000
  }
}
```

## Activation

Add the `statsd-kairosdb-backend` to the list of StatsD backends in the
config file and restart the StatsD process.

```js
{
  backends: ['./backends/graphite', 'statsd-kairosdb-backend']
}
```
