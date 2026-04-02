module.exports = {
  apps: [
    {
      name: "pos-backend",
      script: "./build/index.js",
      instances: "max",
      exec_mode: "cluster",
      kill_timeout: 5000,
      // node_args: "--require ./dist/instrumentation.js",
    },
  ],
};
