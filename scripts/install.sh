#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BIN_DIR="${READLENS_BIN_DIR:-$HOME/bin}"
UPDATE_SHELL_RC=1

usage() {
  cat <<USAGE
ReadLens installer

Usage:
  scripts/install.sh [--bin-dir DIR] [--no-shell-rc]

Installs command aliases for:
  readlens
  agent-reader

Options:
  --bin-dir DIR     Directory for command symlinks. Default: \$HOME/bin
  --no-shell-rc     Do not update shell rc alias/PATH block.
USAGE
}

shell_quote() {
  local value="$1"
  printf "'%s'" "${value//\'/\'\\\'\'}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bin-dir)
      if [[ $# -lt 2 ]]; then
        echo "--bin-dir requires a value" >&2
        exit 1
      fi
      BIN_DIR="$2"
      shift 2
      ;;
    --no-shell-rc)
      UPDATE_SHELL_RC=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

mkdir -p "$BIN_DIR"
ln -sfn "$ROOT_DIR/bin/readlens" "$BIN_DIR/readlens"
ln -sfn "$ROOT_DIR/bin/agent-reader" "$BIN_DIR/agent-reader"
chmod +x "$ROOT_DIR/bin/readlens" "$ROOT_DIR/bin/agent-reader"

choose_shell_rc() {
  local shell_name
  shell_name="$(basename "${SHELL:-}")"
  case "$shell_name" in
    zsh) printf '%s/.zshrc' "$HOME" ;;
    bash) printf '%s/.bashrc' "$HOME" ;;
    *) printf '%s/.profile' "$HOME" ;;
  esac
}

update_shell_rc() {
  local rc_file="$1"
  local tmp_file
  local bin_dir_q readlens_q agent_reader_q
  bin_dir_q="$(shell_quote "$BIN_DIR")"
  readlens_q="$(shell_quote "$BIN_DIR/readlens")"
  agent_reader_q="$(shell_quote "$BIN_DIR/agent-reader")"

  mkdir -p "$(dirname "$rc_file")"
  touch "$rc_file"
  tmp_file="$(mktemp)"
  awk '
    $0 == "# >>> ReadLens CLI >>>" { skip = 1; next }
    $0 == "# <<< ReadLens CLI <<<" { skip = 0; next }
    skip != 1 { print }
  ' "$rc_file" > "$tmp_file"
  cat >> "$tmp_file" <<RC

# >>> ReadLens CLI >>>
# Managed by ReadLens installer. Re-run scripts/install.sh to refresh.
export PATH=$bin_dir_q:\$PATH
alias readlens=$readlens_q
alias agent-reader=$agent_reader_q
# <<< ReadLens CLI <<<
RC
  mv "$tmp_file" "$rc_file"
}

if [[ "$UPDATE_SHELL_RC" == "1" ]]; then
  RC_FILE="$(choose_shell_rc)"
  update_shell_rc "$RC_FILE"
  echo "Updated shell aliases in $RC_FILE"
else
  RC_FILE=""
fi

cat <<DONE
ReadLens commands installed:
  $BIN_DIR/readlens -> $ROOT_DIR/bin/readlens
  $BIN_DIR/agent-reader -> $ROOT_DIR/bin/agent-reader

Try:
  readlens serve
  readlens stop
DONE

if [[ -n "${RC_FILE:-}" ]]; then
  echo "Restart your shell or run: source $RC_FILE"
fi
