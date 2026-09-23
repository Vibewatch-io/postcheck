#!/bin/zsh
# Drive the iPhone Mirroring window. Coordinates are relative to the window's top-left.
S=${0:A:h}  # captures land next to this script
bounds() { osascript -e 'tell application "System Events" to tell process "iPhone Mirroring" to get {position, size} of window 1' | tr -d ' '; }
B=$(bounds); X=${B%%,*}; R=${B#*,}; Y=${R%%,*}; R=${R#*,}; W=${R%%,*}; H=${R#*,}
case $1 in
  cap) screencapture -x -R"$B" "$S/$2.png"; echo "captured $2 ($W x $H)";;
  tap) osascript -e 'tell application "iPhone Mirroring" to activate'; sleep 0.3; "$S/tap" tap $((X+$2)) $((Y+$3)); sleep ${4:-1.5};;
  swipe) osascript -e 'tell application "iPhone Mirroring" to activate'; sleep 0.3; "$S/tap" drag $((X+$2)) $((Y+$3)) $((X+$4)) $((Y+$5)) ${6:-25}; sleep ${7:-1.5};;
  scroll) osascript -e 'tell application "iPhone Mirroring" to activate'; sleep 0.3; "$S/tap" scroll $((X+$2)) $((Y+$3)) $4; sleep ${5:-1.5};;
  bounds) echo "$B";;
esac
