//jshint ignore: start
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
        NODE_ENV: "production"
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
        NODE_ENV: "production"
      },
      error_file: "./log/lv/err.log",
      out_file: "./log/lv/out.log",
      kill_timeout: 3000,
      wait_ready: true,
      exec_mode: "fork",
      merge_logs: true
    }
  ]
}

/*
module.exports = {
  apps : [

    // First application
    {
      name      : 'API',
      script    : 'app.js',
      env: {
        COMMON_VARIABLE: 'true'
      },
      env_production : {
        NODE_ENV: 'production'
      }
    },

    // Second application
    {
      name      : 'WEB',
      script    : 'web.js'
    }
  ],
  deploy : {
    production : {
      user : 'node',
      host : '212.83.163.1',
      ref  : 'origin/master',
      repo : 'git@github.com:repo.git',
      path : '/var/www/production',
      'post-deploy' : 'npm install && pm2 reload ecosystem.config.js --env production'
    },
    dev : {
      user : 'node',
      host : '212.83.163.1',
      ref  : 'origin/master',
      repo : 'git@github.com:repo.git',
      path : '/var/www/development',
      'post-deploy' : 'npm install && pm2 reload ecosystem.config.js --env dev',
      env  : {
        NODE_ENV: 'dev'
      }
    }
  }
};
*/
