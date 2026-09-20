@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==============================================
echo   刷题记录本 启动中...
echo   使用期间请勿关闭本窗口
echo ==============================================
echo.
echo 本机访问：http://127.0.0.1:8765
echo 同局域网访问（手机/其他电脑）：http://%COMPUTERNAME%:8765
echo 或查看本机局域网 IP 后访问：http://本机IP:8765
echo.
set HOST=0.0.0.0
set PORT=8765
python server.py
pause
