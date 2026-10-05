#!/bin/zsh
# Drive a USB-connected Android phone (a Pixel 3, 1080x2160 px) for X app captures.
# Coordinates are capture pixels. Navigation only: never tap like, repost, reply, follow or compose.
# With several devices attached, set ANDROID_SERIAL (adb reads it).
S=${0:A:h}  # captures land next to this script
case $1 in
  # dp 360 | 412 | reset: lay the app out at a target width by overriding the density (like Settings → Display size).
  # 1080 px at 480 dpi = 360 dp wide (Galaxy S25 class); at 420 dpi = 411.4 dp, what a real 1080 px Pixel 10 reports.
  # Only the width matches: the Pixel 3 is 2160 px tall, so the app gets 679 / 776 dp of height instead of 780 / 923.
  # X only picks up the change on a fresh start, so this restarts it.
  dp)
    case $2 in 360) adb shell wm density 480;; 412) adb shell wm density 420;; reset) adb shell wm density reset;;
      *) echo "dp 360|412|reset"; exit 1;; esac
    adb shell am force-stop com.twitter.android; "$0" info;;
  info)  # what the app lays out against
    adb shell am get-config | grep -o 'sw[0-9]*dp-w[0-9]*dp-h[0-9]*dp'
    adb shell wm size; adb shell wm density
    echo "font_scale $(adb shell settings get system font_scale | tr -d '\r')  android $(adb shell getprop ro.build.version.release | tr -d '\r')  X $(adb shell dumpsys package com.twitter.android | grep -m1 -o 'versionName=.*' | cut -d= -f2)";;
  view) scrcpy --no-audio --window-title "Android (postcheck)" > /dev/null 2>&1 &;;  # live mirror for watching; captures don't need it
  cap) adb exec-out screencap -p > "$S/$2.png"; echo "captured $2 ($(sips -g pixelWidth -g pixelHeight "$S/$2.png" | awk '/pixel/{printf "%s ", $2}'))";;
  tap) adb shell input tap $2 $3; sleep ${4:-1.5};;
  # scroll x y dy: drag the content up by dy px (positive = further down the page), slow enough not to fling
  scroll) adb shell input swipe $2 $3 $2 $(($3 - $4)) ${5:-600}; sleep ${6:-1.5};;
  back) adb shell input keyevent BACK; sleep ${2:-1.5};;
  # open an x.com URL in the X app: a profile for timeline cells, /<handle>/status/<id> for the post screen
  # adb shell hands the line to the device's sh, so only plain https://x.com/ URLs get through (no quotes or
  # shell characters), and never a compose or intent link.
  open)
    [[ $2 =~ '^https://x\.com/[A-Za-z0-9_./?=&%:+~-]*$' && $2 != *compose* && $2 != */intent/* ]] || { echo "open: only https://x.com/ navigation URLs" >&2; exit 1; }
    adb shell "am start -W -a android.intent.action.VIEW -p com.twitter.android -d '$2'" > /dev/null; sleep ${3:-3};;
  *) echo "usage: android.sh dp 360|412|reset | info | view | cap name | tap x y | scroll x y dy | back | open url"; exit 1;;
esac
