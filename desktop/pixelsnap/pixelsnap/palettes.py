"""Built-in RGB palettes and strict HEX / GIMP palette import."""
import re

EXTRA_PALETTES = {
    "nes": "7c7c7c 0000fc 0000bc 4428bc 940084 a80020 a81000 881400 503000 007800 006800 005800 004058 000000 000000 000000 bcbcbc 0078f8 0058f8 6844fc d800cc e40058 f83800 e45c10 ac7c00 00b800 00a800 00a844 008888 000000 000000 000000 f8f8f8 3cbcfc 6888fc 9878f8 f878f8 f85898 f87858 fca044 f8b800 b8f818 58d854 58f898 00e8d8 787878 000000 000000 fcfcfc a4e4fc b8b8f8 d8b8f8 f8b8f8 f8a4c0 f0d0b0 fce0a8 f8d878 d8f878 b8f8b8 b8f8d8 00fcfc f8d8f8 000000 000000".split(),
    "endesga32": "be4a2f d77643 ead4aa e4a672 b86f50 733e39 3e2731 a22633 e43b44 f77622 feae34 fee761 63c74d 3e8948 265c42 193c3e 124e89 0099db 2ce8f5 ffffff c0cbdc 8b9bb4 5a6988 3a4466 262b44 181425 ff0044 68386c b55088 f6757a e8b796 c28569".split(),
    "sweetie16": "1a1c2c 5d275d b13e53 ef7d57 ffcd75 a7f070 38b764 257179 29366f 3b5dc9 41a6f6 73eff7 f4f4f4 94b0c2 566c86 333c57".split(),
    "cga": "000000 55ffff ff55ff ffffff".split(),
    "1bit": ["000000", "ffffff"],
}


def parse_palette(text):
    """Accept #RGB/#RRGGBB lists, Lospec .hex, or GIMP .gpl text."""
    text = text.strip().lstrip("\ufeff")
    if len(text) > 65536:
        raise ValueError("Palette file must be under 64 KB.")
    colors = []
    if text.startswith("GIMP Palette"):
        for line in text.splitlines()[1:]:
            line = line.strip()
            if not line or line.startswith(("#", "Name:", "Columns:")):
                continue
            parts = line.split()
            if len(parts) < 3 or not all(p.isdigit() and 0 <= int(p) <= 255 for p in parts[:3]):
                raise ValueError("Invalid GPL colour; expected three RGB values from 0 to 255.")
            colors.append("".join(f"{int(p):02x}" for p in parts[:3]))
    else:
        for token in re.split(r"[\s,;]+", text):
            token = token.removeprefix("#")
            if not re.fullmatch(r"[0-9a-fA-F]{3}|[0-9a-fA-F]{6}", token):
                raise ValueError("Use hex colours such as #172038, #f5c267, #ffffff.")
            colors.append(("".join(c * 2 for c in token) if len(token) == 3 else token).lower())
    colors = list(dict.fromkeys(colors))
    if not 2 <= len(colors) <= 64:
        raise ValueError("Custom palettes need 2–64 different colours.")
    return colors
