#!/usr/bin/env bash
# Safe loader for deploy/.env, sourced by backup.sh and restore-drill.sh. It READS the file as data and never evaluates it,
# so a value with spaces, `$`, backticks, `;` or `&` (a password, a URL with a query string) is taken literally and cannot
# run anything, which `. ./.env` would do. Format: KEY=VALUE per line; blank lines and `#` comments are skipped; an optional
# `export ` prefix is allowed; one pair of matching surrounding quotes is removed (as Docker Compose does); no expansion.
load_env_file() {
  local file=$1 line key value
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}
    line=${line#"${line%%[![:space:]]*}"}                # strip leading whitespace
    case "$line" in '' | '#'*) continue ;; esac
    line=${line#export }
    case "$line" in *=*) ;; *) continue ;; esac
    key=${line%%=*}
    value=${line#*=}
    key=${key%"${key##*[![:space:]]}"}                   # strip trailing whitespace of the key
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    if [[ "$value" =~ ^\"(.*)\"$ ]] || [[ "$value" =~ ^\'(.*)\'$ ]]; then
      value=${BASH_REMATCH[1]}
    fi
    export "$key=$value"
  done < "$file"
}
