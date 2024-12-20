#!/usr/bin/env bash

NEW_VERSION=$1
SELF_PATH=${BASH_SOURCE[0]:-"$(command -v -- "$0")"}
PROJECT_ROOT="$(dirname "$SELF_PATH")/.."

function bump_ts_sdk() {
    npm --prefix $1 install @restatedev/restate-sdk@^$NEW_VERSION
}

function bump_ts_sdk_clients() {
    npm --prefix $1 install @restatedev/restate-sdk-clients@^$NEW_VERSION
}

bump_ts_sdk $PROJECT_ROOT/basics/basics-typescript
bump_ts_sdk_clients $PROJECT_ROOT/basics/basics-typescript

bump_ts_sdk $PROJECT_ROOT/templates/typescript
bump_ts_sdk $PROJECT_ROOT/templates/typescript-testing
bump_ts_sdk_clients $PROJECT_ROOT/templates/typescript-testing
bump_ts_sdk $PROJECT_ROOT/templates/typescript-lambda-cdk
bump_ts_sdk $PROJECT_ROOT/templates/bun

# Cloudflare workers has a different module
npm --prefix $PROJECT_ROOT/templates/cloudflare-worker install @restatedev/restate-sdk-cloudflare-workers@^$NEW_VERSION

# deno bump - it doesn't use a package.json, only import strings
# -i works differently in gnu sed and mac (bsd) sed - best avoided
tmp=$(mktemp)
sed "s#\"npm:@restatedev/restate-sdk@^.*/fetch\"#\"npm:@restatedev/restate-sdk@^${NEW_VERSION}/fetch\"#g" $PROJECT_ROOT/templates/deno/main.ts > $tmp
mv $tmp $PROJECT_ROOT/templates/deno/main.ts

bump_ts_sdk $PROJECT_ROOT/tutorials/tour-of-restate-typescript

bump_ts_sdk $PROJECT_ROOT/patterns-use-cases/async-signals-payment/async-signals-payment-typescript
bump_ts_sdk $PROJECT_ROOT/patterns-use-cases/durable-promises/durable-promises-typescript
bump_ts_sdk_clients $PROJECT_ROOT/patterns-use-cases/durable-promises/durable-promises-typescript
bump_ts_sdk $PROJECT_ROOT/patterns-use-cases/payment-state-machine/payment-state-machine-typescript
bump_ts_sdk $PROJECT_ROOT/patterns-use-cases/sagas/sagas-typescript
bump_ts_sdk $PROJECT_ROOT/patterns-use-cases/state-machines/state-machines-typescript

bump_ts_sdk $PROJECT_ROOT/end-to-end-applications/typescript/ai-image-workflows
bump_ts_sdk $PROJECT_ROOT/end-to-end-applications/typescript/food-ordering/app
bump_ts_sdk_clients $PROJECT_ROOT/end-to-end-applications/typescript/food-ordering/webui
bump_ts_sdk $PROJECT_ROOT/end-to-end-applications/typescript/chat-bot
