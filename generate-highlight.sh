#!/bin/sh -eu

COMMIT_ID=e6c1c0c45a02baf744cf02522eb83eb3b6ccc542
CACHE_DIR=cache/keywords.txt

mkdir -p $CACHE_DIR

if [ ! -f $CACHE_DIR/$COMMIT_ID ]; then
    wget https://raw.githubusercontent.com/processing/processing4/$COMMIT_ID/java/keywords.txt -O $CACHE_DIR/$COMMIT_ID
fi

node generate-highlight.js $CACHE_DIR/$COMMIT_ID
