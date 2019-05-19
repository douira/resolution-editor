/* eslint-disable */
module.exports = {
  apps: [
    {
      name: "mongod",
      script: "mongod",
      args: "--auth --port 27017 --dbpath data",
      error_file: "./log/db/err.log",
      out_file: "./log/db/out.log",
      kill_timeout: 5000,
      exec_mode: "fork",
      merge_logs: true,
      max_restarts: 30
    },
    {
      name: "webserver",
      script: "./bin/www.js",
      args: "--trace-deprecation",
      env: {
        PORT: 3000,
        WS_LV: "off",
        SERVE_LOCAL: "off",
        PRINT_ERR: "on",
        LOG_NORM_ACCESS: "off",
        NODE_ENV: "dev"
      },
      env_offline: {
        SERVE_LOCAL: "on"
      },
      error_file: "./log/env/err.log",
      out_file: "./log/env/out.log",
      kill_timeout: 3000,
      wait_ready: true,
      exec_mode: "cluster",
      instances: "3",
      merge_logs: true
    },
    {
      name: "liveview",
      script: "./bin/lvServer.js",
      args: "--trace-deprecation",
      env: {
        PORT: 17750,
        PRINT_ERR: "on",
        NODE_ENV: "dev"
      },
      error_file: "./log/lv/err.log",
      out_file: "./log/lv/out.log",
      kill_timeout: 3000,
      wait_ready: true,
      exec_mode: "fork",
      merge_logs: true
    }
  ]
};
