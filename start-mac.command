#!/bin/bash
cd "$(dirname "$0")"
echo "正在启动网站..."
echo "前台地址：http://localhost:8080"
echo "后台地址：http://localhost:8080/admin"
npm start
