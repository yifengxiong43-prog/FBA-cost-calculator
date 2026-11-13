@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo 请先安装 Node.js 18 或更高版本。& pause& exit /b 1)
if not exist node_modules (echo 正在安装本地依赖...& npm install)
npm run build
start "Art Cost Desk" http://127.0.0.1:4177/
node local-server.mjs
