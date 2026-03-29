@echo off
setlocal
python -m pip install --upgrade pip
python -m pip install requests beautifulsoup4 "qdrant-client[fastembed]"
endlocal
