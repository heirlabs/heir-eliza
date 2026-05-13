module.exports = {
  apps: [
    // MongoDB-backed agent (primary)
    {
      name: 'asktim',
      script: './start-mongodb-agent.ts',
      cwd: '/home/ubuntu/alpha-ton',
      interpreter: '/home/ubuntu/.bun/bin/bun',
      interpreter_args: 'run',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
        AGENT_ID: 'asktim-agent',
        MONGODB_URI: 'mongodb://localhost:27017/eliza',
        MONGODB_DB_NAME: 'eliza',
        // Optional: specify character file
        // CHARACTER_PATH: './packages/project-alphaton/characters/analystCharacter.json',
      },
      env_file: '.env',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '2G',
      error_file: './logs/asktim-error.log',
      out_file: './logs/asktim-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 30000,
    },
    // Optional: Keep standard elizaos available on different port
    // {
    //   name: 'asktim-sql',
    //   script: '/home/ubuntu/.bun/bin/elizaos',
    //   args: 'start --port 3002',
    //   cwd: '/home/ubuntu/alpha-ton',
    //   interpreter: 'none',
    //   env: {
    //     NODE_ENV: 'production',
    //   },
    //   env_file: '.env',
    //   instances: 1,
    //   exec_mode: 'fork',
    //   watch: false,
    //   max_memory_restart: '2G',
    //   error_file: './logs/asktim-sql-error.log',
    //   out_file: './logs/asktim-sql-out.log',
    //   autorestart: false,
    // }
  ]
};
