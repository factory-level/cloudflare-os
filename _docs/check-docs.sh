#!/usr/bin/env bash
# Validate fork documentation structure for the Documentation Loop.
# Adapted from the documentation starter template: documents live in _docs/ because
# upstream owns docs/, and link checking is limited to _docs/ for the same reason.
# Errors exit non-zero; warnings are reported but do not fail.
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root" || exit 2

docs="_docs"

errors=0
warnings=0

error() { printf 'ERROR: %s\n' "$*"; errors=$((errors + 1)); }
warn() { printf 'WARN:  %s\n' "$*"; warnings=$((warnings + 1)); }

# Print the YAML front matter of a file, without the delimiters.
front_matter() {
  awk 'NR == 1 && $0 != "---" { exit } NR > 1 && $0 == "---" { exit } NR > 1 { print }' "$1"
}

# Print the value of a top-level front matter key.
fm_value() {
  front_matter "$1" | sed -n "s/^$2:[[:space:]]*//p" | head -n 1
}

# Print the list items under a top-level front matter key.
fm_list() {
  front_matter "$1" | awk -v key="$2" '
    $0 ~ "^" key ":" { in_list = 1; next }
    in_list && /^[[:space:]]+-[[:space:]]/ { sub(/^[[:space:]]+-[[:space:]]+/, ""); print; next }
    in_list && /^[^[:space:]]/ { in_list = 0 }
  '
}

is_template() {
  case "$(basename "$1")" in
    _template.md | 0000-template.md | README.md) return 0 ;;
  esac
  return 1
}

check_keys() {
  local file="$1"; shift
  if [ "$(head -n 1 "$file")" != "---" ]; then
    error "$file: missing YAML front matter"
    return
  fi
  local key
  for key in "$@"; do
    if ! front_matter "$file" | grep -q "^$key:"; then
      error "$file: missing front matter key '$key'"
    fi
  done
}

check_enum() {
  local file="$1" key="$2" value; shift 2
  value="$(fm_value "$file" "$key")"
  [ -z "$value" ] && return
  local allowed
  for allowed in "$@"; do
    [ "$value" = "$allowed" ] && return
  done
  error "$file: $key '$value' is not one of: $*"
}

check_date() {
  local file="$1" key="$2" value
  value="$(fm_value "$file" "$key")"
  [ -z "$value" ] && return
  if ! [[ "$value" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    error "$file: $key '$value' is not a YYYY-MM-DD date"
  fi
}

check_indexed() {
  local file="$1" index
  index="$(dirname "$file")/README.md"
  if [ ! -f "$index" ]; then
    error "$index: missing folder index"
  elif ! grep -qF "]($(basename "$file"))" "$index"; then
    warn "$file: not listed in $index"
  fi
}

shopt -s nullglob

for file in "$docs"/*/*.md; do
  is_template "$file" && continue
  if ! [[ "$(basename "$file")" =~ ^[a-z0-9][a-z0-9-]*\.md$ ]]; then
    error "$file: filename must be lowercase and hyphen-separated"
  fi
done

for file in "$docs"/design/*.md; do
  is_template "$file" && continue
  check_keys "$file" title status updated
  check_enum "$file" status draft accepted superseded
  check_date "$file" updated
  check_indexed "$file"
done

for file in "$docs"/architecture/*.md; do
  is_template "$file" && continue
  check_keys "$file" title covers updated
  check_date "$file" updated
  check_indexed "$file"
  if [ ! -f "$docs/design/$(basename "$file")" ]; then
    warn "$file: no matching design document $docs/design/$(basename "$file")"
  fi
  covered=0
  while IFS= read -r path; do
    [ -z "$path" ] && continue
    covered=1
    if [ ! -e "$path" ]; then
      error "$file: covered path '$path' does not exist"
    fi
  done < <(fm_list "$file" covers)
  [ "$covered" -eq 0 ] && error "$file: 'covers' lists no paths"
done

for file in "$docs"/adr/*.md; do
  is_template "$file" && continue
  if ! [[ "$(basename "$file")" =~ ^[0-9]{4}-[a-z0-9-]+\.md$ ]]; then
    error "$file: ADR filename must match NNNN-short-slug.md"
  fi
  check_keys "$file" title status date
  check_enum "$file" status proposed accepted superseded deprecated
  check_date "$file" date
  check_indexed "$file"
done
duplicates="$(for file in "$docs"/adr/[0-9][0-9][0-9][0-9]-*.md; do basename "$file" | cut -c1-4; done | grep -v '^0000$' | sort | uniq -d)"
for number in $duplicates; do
  error "$docs/adr: ADR number $number is used more than once"
done

for file in "$docs"/wiki/*.md; do
  is_template "$file" && continue
  check_keys "$file" title updated
  check_date "$file" updated
  check_indexed "$file"
done

# Relative links in fork documentation outside templates must resolve.
while IFS= read -r file; do
  case "$(basename "$file")" in
    _template.md | 0000-template.md) continue ;;
  esac
  dir="$(dirname "$file")"
  while IFS= read -r target; do
    target="${target%%#*}"
    [ -z "$target" ] && continue
    case "$target" in
      http://* | https://* | mailto:*) continue ;;
    esac
    if [ ! -e "$dir/$target" ]; then
      error "$file: broken link '$target'"
    fi
  done < <(grep -o '\]([^)[:space:]]*)' "$file" | sed 's/^](//; s/)$//')
done < <(find "$docs" -name '*.md' -type f -print | sort)

# Fork addition, not in the starter template. With UPSTREAM_REF naming the ref that
# tracks upstream, fail on unrecorded edits to upstream-owned files and warn about
# fork-added paths that no architecture document covers.
# Each path is reported once, as its shallowest ancestor that upstream does not have.
if [ -n "${UPSTREAM_REF:-}" ]; then
  if ! git rev-parse --verify --quiet "$UPSTREAM_REF^{commit}" > /dev/null; then
    error "UPSTREAM_REF '$UPSTREAM_REF' is not a commit"
  else
    mapfile -t covers < <(for file in "$docs"/architecture/*.md; do
      is_template "$file" || fm_list "$file" covers
    done)
    # An edit to an upstream-owned file must be a recorded touchpoint.
    mapfile -t touchpoints < <(for file in "$docs"/architecture/*.md; do
      is_template "$file" || fm_list "$file" touchpoints
    done)
    while IFS= read -r file; do
      for path in "${touchpoints[@]}"; do
        [ "$file" = "$path" ] && continue 2
      done
      error "$file: upstream-owned file is edited but is not listed in any architecture document's touchpoints"
    done < <(git diff --name-only --diff-filter=MDR "$(git merge-base "$UPSTREAM_REF" HEAD)" --)
    declare -A reported=()
    while IFS= read -r file; do
      case "$file" in
        "$docs"/* | .claude/* | .github/*) continue ;;
      esac
      for path in "${covers[@]}"; do
        path="${path%/}"
        case "$file" in
          "$path" | "$path"/*) continue 2 ;;
        esac
      done
      owned=""
      rest="$file"
      while [ -n "$rest" ]; do
        owned="${owned:+$owned/}${rest%%/*}"
        git cat-file -e "$UPSTREAM_REF:$owned" 2> /dev/null || break
        case "$rest" in
          */*) rest="${rest#*/}" ;;
          *) rest="" ;;
        esac
      done
      [ -n "${reported[$owned]:-}" ] && continue
      reported[$owned]=1
      warn "$owned: fork-added path is not covered by any architecture document"
    done < <({ git diff --name-only --diff-filter=A "$UPSTREAM_REF" --; git ls-files --others --exclude-standard; } | sort -u)
  fi
fi

printf '%d error(s), %d warning(s)\n' "$errors" "$warnings"
[ "$errors" -eq 0 ]
