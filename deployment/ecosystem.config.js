module.exports = {
  apps: [{
    name: "traininglab",
    script: "node_modules/.bin/next",
    args: "start",
    cwd: "/var/www/traininglab",
    env: {
      NODE_ENV: "production",
      PORT: "3000",
    },
    max_memory_restart: "512M",
    autorestart: true,
    watch: false,
    wait_ready: true,
    listen_timeout: 10000,
  }]
};
