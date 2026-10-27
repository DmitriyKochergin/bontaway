export BONTAWAY_BUILD_TIME="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
cd game && yarn build && yarn deploy