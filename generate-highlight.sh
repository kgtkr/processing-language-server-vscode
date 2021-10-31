#!/bin/sh -eu

# download keywords.txt

if [ ! -f keywords.txt ]; then
    wget https://raw.githubusercontent.com/processing/processing4/master/java/keywords.txt -O keywords.txt
fi
node generate-highlight.js
