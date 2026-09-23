# Verifying against the real app through iPhone Mirroring

The app rules in QUIRKS.md were verified by capturing the X app on a real iPhone
through macOS iPhone Mirroring and comparing each post with the tool.

1. Open iPhone Mirroring, sign in to X on the phone. View → Larger helps legibility.
2. Grant the terminal (or whatever runs the scripts) Screen Recording and Accessibility in System Settings → Privacy & Security.
3. Build the input helper once: `swiftc -O tap.swift -o tap`.
4. `./phone.sh cap name` captures the mirroring window to `name.png`; `./phone.sh tap x y`, `./phone.sh scroll x y ticks` and `./phone.sh swipe x1 y1 x2 y2` drive it (coordinates relative to the window's top-left, as seen in the capture).
5. Load the same post in the tool with its x.com URL and compare line breaks, the fold point and the card.

Only tap navigation targets (search, profile, timestamps, back). Never tap like, repost, reply or compose.
