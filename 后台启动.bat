@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 刷题记录本已启动，请手动打开浏览器访问 http://127.0.0.1:8765
set HOST=0.0.0.0
set PORT=8765
python server.py --no-browser
pause
