"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

export type Lang = "en" | "am"

type Dict = Record<string, string>

const en: Dict = {
  // Bottom nav
  "nav.game": "Game",
  "nav.scores": "Scores",
  "nav.history": "History",
  "nav.wallet": "Wallet",
  "nav.profile": "Profile",

  // Header
  "header.rules": "Rules",

  // Home / lobby
  "home.online": "online now",
  "home.balance": "Your Balance",
  "home.stake": "Stake",
  "home.choose_stake": "Choose Your Stake",
  "home.pot": "Pot · Derash",
  "home.play": "PLAY",
  "home.watch": "Watch a Live Game",
  "home.footer": "Play Responsibly · 18+",
  "home.no_live": "No live game right now. Please wait for the next round.",
  "home.bonus": "Bonus",
  "home.bonus_hint": "You have {n} ETB bonus — it is playable right now!",
  "home.recent_winners": "Recent Winners",
  "home.winners_empty": "Be the first winner of the round!",

  // Cartela selection
  "sel.title": "Select Cartelas",
  "sel.wallet": "Wallet",
  "sel.stake": "Stake",
  "sel.derash": "Derash",
  "sel.selected": "Selected",
  "sel.time": "Time",
  "sel.available": "Available Cartelas (1-500)",
  "sel.your_cartelas": "Your Cartelas",
  "sel.active": "Active",
  "sel.tap_hint_a": "Tap a number to pick",
  "sel.tap_hint_b": "up to {n} cartelas",
  "sel.total_cost": "Total Cost",
  "sel.starts_in": "Game Starts In",
  "sel.waiting": "Waiting for players...",
  "sel.insufficient": "Insufficient balance",
  "sel.topup": "Top up wallet",
  "sel.pick_before": "Pick up to {n} cartelas before time runs out",
  "sel.max_warn": "You can only choose up to {n} cartelas.",
  "sel.taken": "This cartela was just taken by another player!",
  "sel.reserve_failed": "Could not reserve cartela. Try again.",
  "sel.waiting_players": "{n} more player needed to start",
  "sel.players_ready": "players ready",

  // Phone share
  "phone.welcome_named": "Welcome, {name}!",
  "phone.welcome": "Welcome!",
  "phone.desc": "Share your phone number to secure your wallet, withdrawals, and prize payouts.",
  "phone.label": "Phone number",
  "phone.invalid": "Please enter a valid phone number (e.g. 0912345678)",
  "phone.saving": "SAVING…",
  "phone.checking": "CHECKING…",
  "phone.continue": "CONTINUE",
  "phone.share_via_tg": "Share via Telegram contact",
  "phone.checking_tg": "Checking Telegram contact…",
  "phone.privacy": "Your number stays private. We only use it for wallet verification and TeleBirr withdrawals.",
  "phone.shared_saving": "Phone shared. Opening the game…",
  "phone.cancelled": "Contact sharing was cancelled. Please use Telegram contact sharing to continue.",
  "phone.not_avail": "Telegram contact sharing is only available inside the Telegram mini app.",
  "phone.read_fail": "Telegram shared it, but we couldn't read the number yet. Please tap Share Contact again.",
  "phone.save_fail": "Could not save phone number",

  // Telegram-only gate
  "block.title": "Open from Telegram",
  "block.desc": "This game only works inside the Telegram app. Open it from Telegram and share your phone number to continue.",
  "block.open": "Open in Telegram",
  "block.hint": "Only official access through Telegram is allowed.",

  // Profile
  "profile.verified": "Verified Player",
  "profile.main_wallet": "Main Wallet",
  "profile.play_wallet": "Play Wallet",
  "profile.withdrawable": "Withdrawable",
  "profile.game_credits": "Game Credits",
  "profile.game_win": "Game Win",
  "profile.invites": "Invites",
  "profile.earned": "Earned",
  "profile.my_invites": "My Invites",
  "profile.deposited": "deposited",
  "profile.no_invites": "No invites yet. Share your link from the bot to earn {n} ETB per qualifying deposit.",
  "profile.pending": "Pending",
  "profile.sound": "SOUND EFFECTS",
  "profile.sound_sub": "Toggle game audio",
  "profile.language": "LANGUAGE",
  "profile.language_sub": "Choose app language",

  // Wallet
  "wallet.title": "MY WALLET",
  "wallet.main": "Main",
  "wallet.bonus": "Bonus",
  "wallet.tab.deposit": "Deposit",
  "wallet.tab.withdraw": "Withdraw",
  "wallet.tab.promo": "Promo",
  "wallet.tab.history": "History",
  "wallet.send_to": "Send payment to",
  "wallet.name": "Name",
  "wallet.telebirr": "TeleBirr",
  "wallet.pay_details": "Payment Details",
  "wallet.sound_on": "Sound On",
  "wallet.sound_off": "Sound Off",
  "wallet.cbe": "CBE",
  "wallet.tap_copy": "Tap to copy",
  "wallet.after_send": "After sending, tap Submit and paste the SMS in the next step.",
  "wallet.quick": "Quick amount (ETB)",
  "wallet.amount_label": "Amount (ETB) — min 50",
  "wallet.min_amount": "Minimum amount is 50 ETB",
  "wallet.min_note": "Minimum deposit is 50 ETB. Send the exact amount you enter here.",
  "wallet.paste_sms": "Please paste the SMS confirmation",
  "wallet.submit_deposit": "Submit deposit",
  "wallet.send_proof": "Send proof",
  "wallet.proof_title": "Send proof",
  "wallet.proof_desc": "Paste the full {provider} confirmation SMS for {amount} ETB.",
  "wallet.proof_desc_sms": "Paste the full telebirr or CBE confirmation SMS for {amount} ETB.",
  "wallet.sms_hint": "Paste the whole message exactly as received. Each SMS can only be used once.",
  "wallet.optional": "optional",
  "wallet.paste": "Paste SMS",
  "wallet.paste_fail": "Couldn't read the clipboard. Paste the SMS manually.",
  "wallet.deposit_now": "Deposit",
  "wallet.sms_required": "Please paste the full confirmation SMS",
  "wallet.cancel": "Cancel",
  "wallet.sending": "Sending…",
  "wallet.sms_label": "SMS confirmation",
  "wallet.deposit_ok_title": "Deposit submitted!",
  "wallet.deposit_ok_msg": "Your deposit request has been received and is pending review. Your balance will update as soon as it's approved.",
  "wallet.ref_label": "Transaction reference (from your receipt/SMS)",
  "wallet.ref_hint": "Example: DFT4DCMMBY or FT12AB34CD56 — we verify it automatically.",
  "wallet.ref_required": "Please enter the transaction reference from your receipt",
  "wallet.suffix_label": "Last digits of your account (optional)",
  "wallet.sms_optional": "SMS confirmation (optional)",
  "wallet.verified_title": "Deposit credited!",
  "wallet.verified_msg": "Your receipt was verified automatically and your balance has been credited.",

  // Scores
  "scores.title": "Top Players",
  "scores.daily": "DAILY",
  "scores.weekly": "WEEKLY",
  "scores.loading": "Loading…",
  "scores.empty": "No rankings yet. Play a game to get on the leaderboard.",
  "scores.games_won": "games won",

  // History
  "history.title": "Game History",
  "history.total_played": "Total Played",
  "history.total_wins": "Total Wins",
  "history.recent": "Recent Activity",
  "history.loading": "Loading…",
  "history.empty": "No games played yet.",
  "history.win": "Win",
  "history.loss": "Loss",
  "history.stake": "Stake",
  "history.payout": "Payout",
  "history.cartela": "Cartela",

  // Wallet extras
  "wallet.tg_id": "TG ID",
  "wallet.available": "Available",
  "wallet.amount_eth": "Amount (ETB)",
  "wallet.telebirr_phone": "TeleBirr phone (09xxxxxxxx)",
  "wallet.cbe_name": "CBE account name",
  "wallet.cbe_number": "CBE account number",
  "wallet.submitting": "Submitting…",
  "wallet.request_withdrawal": "Request withdrawal",
  "wallet.withdraw_ok_title": "Withdrawal requested!",
  "wallet.withdraw_ok_msg": "We've received your withdrawal request. You'll receive the funds once an admin approves the payout.",
  "wallet.got_it": "Got it",
  "wallet.promo_desc": "Got a promo code? Redeem it for bonus credits.",
  "wallet.active_promos": "Active Promos",
  "wallet.tap_code": "Tap a code to fill it in",
  "wallet.no_promos": "No active promo codes right now.",
  "wallet.promo_deposit_match": "Deposit match — applies when your deposit is approved.",
  "wallet.promo_first_deposit": "First deposit of 50 ETB or more? Your inviter earns 10 ETB — invite your friends today!",
  "wallet.promo_left": "{n} left",
  "wallet.promo_label": "Promo code",
  "wallet.promo_credited": "✓ +{n} ETB bonus credited!",
  "wallet.redeeming": "Redeeming…",
  "wallet.redeem": "Redeem",
  "wallet.no_tx": "No transactions yet.",
  "wallet.note": "Note",
  "wallet.tx.deposit": "deposit",
  "wallet.tx.withdrawal": "withdrawal",
  "wallet.status.approved": "approved",
  "wallet.status.rejected": "rejected",
  "wallet.status.pending": "pending",

  // App toasts
  "toast.suspended": "Your account is suspended. Contact support.",
  "toast.insufficient": "Insufficient balance — joining as a watcher.",
  "toast.need_players": "More players are needed to start a game — waiting for the next round.",
  "toast.invalid_state": "Something went wrong — please try selecting your cartelas again.",

  // Auto-rejoin waiting banner
  "auto.join_waiting": "Waiting for players — auto joining the next round in {seconds}s.",
  "auto.cancel": "Cancel",
}

const am: Dict = {
  "nav.game": "ጨዋታ",
  "nav.scores": "ውጤቶች",
  "nav.history": "ታሪክ",
  "nav.wallet": "ቦርሳ",
  "nav.profile": "መገለጫ",

  "header.rules": "ህጎች",

  "home.online": "አሁን በመስመር ላይ",
  "home.balance": "ቀሪ ሂሳብዎ",
  "home.stake": "መጫዎቻ",
  "home.choose_stake": "የመጫዎቻዎን ይምረጡ",
  "home.pot": "ሽልማት · ደራሽ",
  "home.play": "ጀምር",
  "home.watch": "ቀጥታ ጨዋታ ይመልከቱ",
  "home.footer": "በኃላፊነት ይጫወቱ · 18+",
  "home.no_live": "አሁን ቀጥታ ጨዋታ የለም። ቀጣዩን ዙር ይጠብቁ።",
  "home.bonus": "ቦነስ",
  "home.bonus_hint": "{n} ብር ቦነስ አለዎት — አሁኑኑ መጫወት ይችላሉ!",
  "home.recent_winners": "አዳዲስ አሸናፊዎች",
  "home.winners_empty": "የዙሩ የመጀመሪያ አሸናፊ ይሁኑ!",

  "sel.title": "ካርቴላ ይምረጡ",
  "sel.wallet": "ቦርሳ",
  "sel.stake": "መጫዎቻ",
  "sel.derash": "ደራሽ",
  "sel.selected": "የተመረጡ",
  "sel.time": "ጊዜ",
  "sel.available": "ያሉ ካርቴላዎች (1-500)",
  "sel.your_cartelas": "የእርስዎ ካርቴላዎች",
  "sel.active": "ንቁ",
  "sel.tap_hint_a": "ቁጥር ይንኩ",
  "sel.tap_hint_b": "እስከ {n} ካርቴላ ድረስ",
  "sel.total_cost": "ጠቅላላ ክፍያ",
  "sel.starts_in": "ጨዋታ የሚጀምረው በ",
  "sel.waiting": "ተጫዋቾችን በመጠበቅ ላይ...",
  "sel.insufficient": "በቂ ቀሪ ሂሳብ የለም",
  "sel.topup": "ቦርሳ ሙላ",
  "sel.pick_before": "ጊዜ ከመጠናቀቁ በፊት እስከ {n} ካርቴላ ይምረጡ",
  "sel.max_warn": "እስከ {n} ካርቴላ ብቻ መምረጥ ይችላሉ።",
  "sel.taken": "ይህ ካርቴላ በሌላ ጨዋታ ተጫዋች ተይዟል!",
  "sel.reserve_failed": "ካርቴላ ማስመ札 አልተቻለም። እንደገና ይሞክሩ።",
  "sel.waiting_players": "ለመጀመር {n} ተጫዋች ተጨማሪ ያስፈልጋል",
  "sel.players_ready": "ተጫዋቾች ዝግጁ",

  "phone.welcome_named": "እንኳን ደህና መጡ፣ {name}!",
  "phone.welcome": "እንኳን ደህና መጡ!",
  "phone.desc": "ቦርሳዎን፣ ወጪዎችንና ሽልማቶችን ለመጠበቅ ስልክ ቁጥርዎን ያጋሩ።",
  "phone.label": "ስልክ ቁጥር",
  "phone.invalid": "ትክክለኛ ስልክ ቁጥር ያስገቡ (ለምሳሌ 0912345678)",
  "phone.saving": "በማስቀመጥ ላይ…",
  "phone.checking": "በመፈተሽ ላይ…",
  "phone.continue": "ቀጥል",
  "phone.share_via_tg": "በቴሌግራም ኮንታክት ያጋሩ",
  "phone.checking_tg": "ቴሌግራም ኮንታክት በመፈተሽ ላይ…",
  "phone.privacy": "ቁጥርዎ በሚስጥር ይቀመጣል። ለቦርሳ ማረጋገጫና ለቴሌብር ወጪ ብቻ ነው የምንጠቀምበት።",
  "phone.shared_saving": "ስልክ ተጋርቷል። ጨዋታውን እየከፈትን ነው…",
  "phone.cancelled": "የኮንታክት መጋራት ተሰርዟል። ለመቀጠል የቴሌግራም ኮንታክት መጋራትን ይጠቀሙ።",
  "phone.not_avail": "የቴሌግራም ኮንታክት መጋራት በቴሌግራም ሚኒ መተግበሪያ ውስጥ ብቻ ይሰራል።",
  "phone.read_fail": "ቴሌግራም አጋርቷል ግን ቁጥሩን ማንበብ አልቻልንም። እባክዎ Share Contact እንደገና ይንኩ።",
  "phone.save_fail": "ስልክ ቁጥር ማስቀመጥ አልተቻለም",

  // Telegram-only gate
  "block.title": "ከቴሌግራም ይክፈቱ",
  "block.desc": "ይህ ጨዋታ በቴሌግራም መተግበሪያ ውስጥ ብቻ ይሠራል። ለመቀጠል ከቴሌግራም ይክፈቱ እና ስልክ ቁጥርዎን ያጋሩ።",
  "block.open": "በቴሌግራም ክፈት",
  "block.hint": "የተፈቀደው በቴሌግራም ብቻ ነው።",

  "profile.verified": "የተረጋገጠ ተጫዋች",
  "profile.main_wallet": "ዋና ቦርሳ",
  "profile.play_wallet": "የጨዋታ ቦርሳ",
  "profile.withdrawable": "ለማውጣት የሚቻል",
  "profile.game_credits": "የጨዋታ ክሬዲት",
  "profile.game_win": "የጨዋታ ድል",
  "profile.invites": "ግብዣዎች",
  "profile.earned": "ያገኙት",
  "profile.my_invites": "የእኔ ግብዣዎች",
  "profile.deposited": "አስገብተዋል",
  "profile.no_invites": "እስካሁን ግብዣ የለም። ከቦቱ ሊንክዎን ያጋሩ እና በእያንዳንዱ ብቁ ተቀማጭ {n} ብር ያግኙ።",
  "profile.pending": "በመጠባበቅ ላይ",
  "profile.sound": "የድምጽ ውጤቶች",
  "profile.sound_sub": "የጨዋታ ድምጽ ይቆጣጠሩ",
  "profile.language": "ቋንቋ",
  "profile.language_sub": "የመተግበሪያ ቋንቋ ይምረጡ",

  "wallet.title": "የእኔ ቦርሳ",
  "wallet.main": "ዋና",
  "wallet.bonus": "ጉርሻ",
  "wallet.tab.deposit": "ተቀማጭ",
  "wallet.tab.withdraw": "ማውጣት",
  "wallet.tab.promo": "ፕሮሞ",
  "wallet.tab.history": "ታሪክ",
  "wallet.send_to": "ክፍያ ይላኩ ለ",
  "wallet.name": "ስም",
  "wallet.telebirr": "ቴሌብር",
  "wallet.pay_details": "የክፍያ መረጃ",
  "wallet.sound_on": "ድምፅ ክፍት",
  "wallet.sound_off": "ድምፅ ዝግ",
  "wallet.cbe": "CBE",
  "wallet.tap_copy": "ለኮፒ መታ ያድርጉ",
  "wallet.after_send": "ከላኩ በኋላ Submit ይንኩና በሚቀጥለው ደረጃ ኤስኤምኤሱን ያለጥፉ።",
  "wallet.quick": "ፈጣን መጠን (ብር)",
  "wallet.amount_label": "መጠን (ብር) — ቢያንስ 50",
  "wallet.min_amount": "ዝቅተኛው መጠን 50 ብር ነው",
  "wallet.min_note": "ዝቅተኛው ተቀማጭ 50 ብር ነው። እዚህ ያስገቡትን ልክ መጠን ይላኩ።",
  "wallet.paste_sms": "እባክዎ የኤስኤምኤስ ማረጋገጫውን ይለጥፉ",
  "wallet.submit_deposit": "ተቀማጭ ላክ",
  "wallet.send_proof": "ማረጋገጫ ላክ",
  "wallet.proof_title": "ማረጋገጫ ላክ",
  "wallet.proof_desc": "ለ {amount} ብር የተላከውን ሙሉ የ{provider} ኤስኤምኤስ ይለጥፉ።",
  "wallet.proof_desc_sms": "ለ {amount} ብር የተላከውን ሙሉ የቴሌብር ወይም የCBE ማረጋገጫ ኤስኤምኤስ ይለጥፉ።",
  "wallet.sms_hint": "መልዕክቱን እንደደረሰዎት ሙሉውን ይለጥፉ። እያንዳንዱ ኤስኤምኤስ አንድ ጊዜ ብቻ ይሰራል።",
  "wallet.optional": "አማራጭ",
  "wallet.paste": "ኤስኤምኤስ ይለጥፉ",
  "wallet.paste_fail": "ክሊፕቦርዱን ማንበብ አልተቻለም። ኤስኤምኤስን በእጅ ይለጥፉ።",
  "wallet.deposit_now": "አስገባ",
  "wallet.sms_required": "እባክዎ ሙሉውን የማረጋገጫ ኤስኤምኤስ ይለጥፉ",
  "wallet.cancel": "ሰርዝ",
  "wallet.sending": "በመላክ ላይ…",
  "wallet.sms_label": "የኤስኤምኤስ ማረጋገጫ",
  "wallet.deposit_ok_title": "ተቀማጭ ተልኳል!",
  "wallet.deposit_ok_msg": "ጥያቄዎ ደርሷል እና በመገምገም ላይ ነው። እንደተፈቀደ ቀሪ ሂሳብዎ ይዘምናል።",
  "wallet.ref_label": "የግብይት ማጣቀሻ ቁጥር (ከደረሰኝ/ኤስኤምኤስ)",
  "wallet.ref_hint": "ምሳሌ፦ DFT4DCMMBY ወይም FT12AB34CD56 — በራስ-ሰር እናረጋግጣለን።",
  "wallet.ref_required": "እባክዎ ከደረሰኙ ላይ የግብይት ማጣቀሻ ቁጥሩን ያስገቡ",
  "wallet.suffix_label": "የሒሳብዎ የመጨረሻ አሃዞች (አማራጭ)",
  "wallet.sms_optional": "የኤስኤምኤስ ማረጋገጫ (አማራጭ)",
  "wallet.verified_title": "ተቀማጭ ተከፍሏል!",
  "wallet.verified_msg": "ደረሰኝዎ በራስ-ሰር ተረጋግጦ ቀሪ ሂሳብዎ ተሞልቷል።",

  "scores.title": "ምርጥ ተጫዋቾች",
  "scores.daily": "በየቀኑ",
  "scores.weekly": "በየሳምንቱ",
  "scores.loading": "በመጫን ላይ…",
  "scores.empty": "እስካሁን ደረጃ የለም። ጨዋታ ይጫወቱና ደረጃ ላይ ይውጡ።",
  "scores.games_won": "ያሸነፉ ጨዋታዎች",

  "history.title": "የጨዋታ ታሪክ",
  "history.total_played": "ጠቅላላ የተጫወቱ",
  "history.total_wins": "ጠቅላላ ድሎች",
  "history.recent": "የቅርብ ጊዜ እንቅስቃሴ",
  "history.loading": "በመጫን ላይ…",
  "history.empty": "እስካሁን የተጫወቱት ጨዋታ የለም።",
  "history.win": "አሸንፈዋል",
  "history.loss": "ተሸንፈዋል",
  "history.stake": "መጫዎቻ",
  "history.payout": "ክፍያ",
  "history.cartela": "ካርቴላ",

  "wallet.tg_id": "የቴሌግራም መለያ",
  "wallet.available": "ያለዎት",
  "wallet.amount_eth": "መጠን (ብር)",
  "wallet.telebirr_phone": "የቴሌብር ስልክ (09xxxxxxxx)",
  "wallet.cbe_name": "የCBE ሂሳብ ስም",
  "wallet.cbe_number": "የCBE ሂሳብ ቁጥር",
  "wallet.submitting": "በመላክ ላይ…",
  "wallet.request_withdrawal": "ማውጣት ይጠይቁ",
  "wallet.withdraw_ok_title": "የማውጣት ጥያቄ ተልኳል!",
  "wallet.withdraw_ok_msg": "ጥያቄዎ ደርሷል። አስተዳዳሪ ካፀደቀ በኋላ ገንዘቡን ያገኛሉ።",
  "wallet.got_it": "ገባኝ",
  "wallet.promo_desc": "የፕሮሞ ኮድ አለዎት? ለጉርሻ ክሬዲት ይቀይሩት።",
  "wallet.active_promos": "ንቁ ፕሮሞዎች",
  "wallet.tap_code": "ኮድ ለመሙላት ይንኩ",
  "wallet.no_promos": "በአሁኑ ጊዜ ንቁ የፕሮሞ ኮድ የለም።",
  "wallet.promo_deposit_match": "የደመወዝ ማዛመጃ — ተቀማጭዎ ሲፀድቅ ይተገበራል።",
  "wallet.promo_first_deposit": "ለመጀመሪያ ጊዜ 50 ብር ወይም በላይ ያስገቡ? የጋበዘዎት ሰው 10 ብር ያገኛል — ጓደኞችዎን ዛሬ ይጋብዙ!",
  "wallet.promo_left": "{n} ቀርተዋል",
  "wallet.promo_label": "የፕሮሞ ኮድ",
  "wallet.promo_credited": "✓ +{n} ብር ጉርሻ ተጨምሯል!",
  "wallet.redeeming": "በመቀየር ላይ…",
  "wallet.redeem": "ቀይር",
  "wallet.no_tx": "እስካሁን ግብይት የለም።",
  "wallet.note": "ማስታወሻ",
  "wallet.tx.deposit": "ተቀማጭ",
  "wallet.tx.withdrawal": "ማውጣት",
  "wallet.status.approved": "ፀድቋል",
  "wallet.status.rejected": "ተቀባይነት አላገኘም",
  "wallet.status.pending": "በመጠባበቅ ላይ",

  "toast.suspended": "መለያዎ ታግዷል። ድጋፍን ያነጋግሩ።",
  "toast.insufficient": "በቂ ቀሪ ሂሳብ የለም — እንደ ተመልካች ነው የሚገቡት።",
  "toast.need_players": "ጨዋታ ለመጀመር ተጨማሪ ተጫዋቾች ያስፈልጋሉ። ለሚቀጥለው ዙር ይጠብቁ።",
  "toast.invalid_state": "የሆነ ችግር ተፈጠረ — እባክዎ ካርቴላዎን እንደገና ለመምረጥ ይሞክሩ።",

  "auto.join_waiting": "ተጫዋቾችን በመጠባበቅ ላይ — በ{seconds} ሰከንድ ውስጥ ወደሚቀጥለው ዙር በመግባት ላይ።",
  "auto.cancel": "ሰርዝ",
}

const dicts: Record<Lang, Dict> = { en, am }

type Ctx = {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<Ctx | null>(null)

const STORAGE_KEY = "liyu_lang"

function detectInitial(): Lang {
  if (typeof window === "undefined") return "am"
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY) as Lang | null
    if (saved === "en" || saved === "am") return saved
  } catch {}
  // Amharic is the default; English only applies if the user picked it.
  return "am"
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("am")

  useEffect(() => {
    setLangState(detectInitial())
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { window.localStorage.setItem(STORAGE_KEY, l) } catch {}
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = dicts[lang] || en
      let s = dict[key] ?? en[key] ?? key
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
      return s
    },
    [lang],
  )

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    // Safe fallback so components don't crash if rendered outside provider
    return {
      lang: "am",
      setLang: () => {},
      t: (k, vars) => {
        let s = dicts.am[k] ?? en[k] ?? k
        if (vars) for (const [kk, v] of Object.entries(vars)) s = s.replaceAll(`{${kk}}`, String(v))
        return s
      },
    }
  }
  return ctx
}
