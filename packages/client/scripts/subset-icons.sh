#!/usr/bin/env bash
# STELLIS: regenerate the subset Material Symbols (Outlined) font.
#
# Why: the `material-symbols` npm package ships ~11.7 MB of variable icon
# fonts. On mobile the 3.6 MB outlined font outruns font-display:block and
# the ligature source text ("add", "send", ...) shows as raw text. We only
# use the outlined variant + ~40 icons, so we ship a pinned + subset font
# (~298 KB) loaded from src/material-symbols-subset.css.
#
# Requires: pip install --break-system-packages fonttools brotli
#
# When to re-run: after adding new <Symbol>name</Symbol> icons. Add any new
# names to ICONS below (the build won't fail if one is missing — it just
# shows as text, the very thing we're fixing).
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=$(find ../../node_modules -path '*material-symbols*/material-symbols-outlined.woff2' 2>/dev/null | head -1)
[ -z "$SRC" ] && { echo "source font not found"; exit 1; }

# Used icons (grep '<Symbol>...') + dynamic + a buffer of common ones.
ICONS="add all_inbox alternate_email arrow_top_left block brightness_alert \
call_end camera_video close desktop_windows download edit emoticon exit_to_app \
fullscreen fullscreen_exit gif grid_3x3 group headset headset_off home \
keyboard_arrow_down keyboard_arrow_up link mic mic_off no_sound note_stack \
notifications open_in_new screen_share send spa speaker stop_screen_share tag \
voice_chat waving_hand zoom_in zoom_out wifi_tethering wifi_tethering_error \
cancel_presentation groups_2 minimize speed spellcheck spellchecker web_asset \
check done done_all error warning info settings search more_vert more_horiz \
expand_more expand_less arrow_back arrow_forward arrow_back_ios arrow_forward_ios \
chevron_left chevron_right person people people_alt chat chat_bubble call videocam \
image photo attach_file reply delete content_copy star favorite favorite_border \
visibility visibility_off lock lock_open logout login refresh sync schedule today \
volume_up volume_off volume_mute do_not_disturb_on circle radio_button_unchecked \
radio_button_checked dark_mode light_mode palette language shield manage_accounts \
account_circle add_reaction push_pin keep person_add group_add person_remove menu arrow_drop_down arrow_drop_up hub \
forum tune sentiment_satisfied mood campaign verified key vpn_key \
admin_panel_settings dns terminal bug_report"

# Pin wght/GRAD/opsz, keep the FILL axis (Symbol animates it for active states).
python3 -m fontTools.varLib.instancer "$SRC" wght=400 GRAD=0 opsz=24 -o /tmp/ms-instanced.ttf

pyftsubset /tmp/ms-instanced.ttf \
  --output-file=public/fonts/material-symbols-outlined-subset.woff2 --flavor=woff2 \
  --layout-features='liga,dlig,clig,calt,rlig' \
  --text="$ICONS" --no-hinting --desubroutinize

echo "subset: $(ls -lh public/fonts/material-symbols-outlined-subset.woff2 | awk '{print $5}')"
