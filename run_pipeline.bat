@echo off
setlocal
python "scripts\catalog_scraper.py"
if errorlevel 1 exit /b %errorlevel%
python "scripts\inci_enricher.py"
if errorlevel 1 exit /b %errorlevel%
python "scripts\load_to_sqlite.py"
if errorlevel 1 exit /b %errorlevel%
python "scripts\index_to_qdrant.py"
endlocal
