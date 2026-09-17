module.exports = {
  apps: [
    {
      name: 'vsaiptv-backend',
      script: 'src/server.js',
      cwd: './server',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        JWT_SECRET: process.env.JWT_SECRET
      }
    }
  ]
};
