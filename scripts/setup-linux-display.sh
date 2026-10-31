#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if command -v Xvfb >/dev/null 2>&1 || [ -x .local/linux/usr/bin/Xvfb ]; then
  exit 0
fi
if [ ! -f /usr/share/keyrings/debian-archive-keyring.gpg ]; then
  printf '%s\n' 'Install Xvfb using the supported package manager of this Linux distribution.' >&2
  exit 1
fi
. /etc/os-release
if [ "${ID}" != debian ]; then
  printf '%s\n' 'This local display setup supports Debian. Install Xvfb with your distribution package manager.' >&2
  exit 1
fi
task_apt_root="$(pwd)/.local/apt"
mkdir -p "$task_apt_root/lists/partial" "$task_apt_root/debs"
printf 'deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://deb.debian.org/debian %s main\n' "$VERSION_CODENAME" > "$task_apt_root/sources.list"
task_apt_args=(-o "Dir::State::Lists=$task_apt_root/lists" -o "Dir::Etc::SourceList=$task_apt_root/sources.list" -o Dir::Etc::SourceParts=-)
if [ -n "${HTTPS_PROXY:-}" ]; then task_apt_args+=(-o "Acquire::https::Proxy=$HTTPS_PROXY"); fi
/usr/bin/apt-get "${task_apt_args[@]}" update
(cd "$task_apt_root/debs" && /usr/bin/apt-get "${task_apt_args[@]}" download xvfb)
for task_deb in "$task_apt_root"/debs/*.deb; do dpkg-deb -x "$task_deb" .local/linux; done
if ldd .local/linux/usr/bin/Xvfb | rg 'not found'; then
  printf '%s\n' 'Xvfb runtime libraries are missing. Install the reported libraries before running UI checks.' >&2
  exit 1
fi
