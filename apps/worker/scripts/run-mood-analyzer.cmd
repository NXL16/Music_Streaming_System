@echo off
setlocal

REM The worker passes a temporary audio path as %%1. Convert its parent to a
REM short Windows path: Docker's --mount CSV syntax must not receive quotes.
for %%I in ("%~dp1") do set "INPUT_DIR=%%~sI"
docker run --rm --mount type=bind,src=%INPUT_DIR%,dst=/input,readonly music-mood-analyzer:local "/input/%~nx1"
