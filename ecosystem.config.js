module.exports = {
  apps: [
    {
      name: "fleet-hub",
      script: "node_modules/.bin/next",
      args: "start -p 3100",
      cwd: "/var/www/fleet-hub",
      env: {
        NODE_ENV: "production",
        PORT: "3100",
        DB_PATH: "/var/www/fleet-hub/data/fleet-hub.db",
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "/var/www/fleet-hub/logs/error.log",
      out_file: "/var/www/fleet-hub/logs/out.log",
    },
  ],
};
