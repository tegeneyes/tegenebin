"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Info,
  Target,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface RulesScreenProps {
  onBack: () => void;
}

type RuleTab = "overview" | "howto" | "winning" | "penalty";

export function RulesScreen({ onBack }: RulesScreenProps) {
  const [activeTab, setActiveTab] = useState<RuleTab>("overview");
  const { lang } = useI18n();
  const am = lang === "am";

  const tabs = [
    { id: "overview" as RuleTab, label: am ? "አጠቃላይ" : "Overview", icon: Info },
    { id: "howto" as RuleTab, label: am ? "እንዴት እንደሚጫወት" : "How to Play", icon: HelpCircle },
    { id: "winning" as RuleTab, label: am ? "ማሸነፍ" : "Winning", icon: Target },
    { id: "penalty" as RuleTab, label: am ? "ክፍያ" : "Wallet", icon: AlertTriangle },
  ];

  return (
    <div className="flex-1 flex flex-col h-full">
      <header className="px-4 pt-3 pb-2 flex items-center gap-3 border-b border-white/10">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-300" />
        </button>
        <h1 className="text-xl font-display font-bold text-white">
          {am ? "የጨዋታ ህጎች" : "Game Rules"}
        </h1>
      </header>

      <div className="px-4 pt-4">
        <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/10">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 py-2.5 px-2 rounded-lg text-xs font-semibold transition-all flex flex-col items-center gap-1",
                  activeTab === tab.id
                    ? "bg-bingo-accent text-white shadow-lg"
                    : "text-gray-400 hover:text-gray-200",
                )}
              >
                <Icon size={16} />
                <span className="text-[10px]">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4">
        <AnimatePresence mode="wait">
          {activeTab === "overview" && <OverviewTab key="overview" am={am} />}
          {activeTab === "howto" && <HowToPlayTab key="howto" am={am} />}
          {activeTab === "winning" && <WinningTab key="winning" am={am} />}
          {activeTab === "penalty" && <PenaltyTab key="penalty" am={am} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

function OverviewTab({ am }: { am: boolean }) {
  const basics = am
    ? [
        { t: "የውርርድ መጠን ይምረጡ", d: "ከ10፣ 20፣ 50 ወይም 100 ብር ጠረጴዛ ይምረጡ" },
        { t: "ካርቴላ ይምረጡ", d: "እስከ 2 ካርቴላ ብቻ መምረጥ ይችላሉ። ውርርዱ በእያንዳንዱ ካርቴላ ይቆጠራል" },
        { t: "ቆጠራው እስኪያልቅ ይጠብቁ", d: "ጊዜው ሲያልቅ ውርርዱ ከቀሪ ሒሳብዎ ተቀንሶ ጨዋታው ይጀምራል" },
        { t: "በራስ-ሰር ማሸነፍ", d: "ቁጥሮች በራስ-ሰር ምልክት ይደረጋሉ፤ መስመር ሲሞላ ስርዓቱ ራሱ ያሸንፍልዎታል" },
      ]
    : [
        { t: "Choose Your Stake", d: "Pick a 10, 20, 50 or 100 ETB table" },
        { t: "Pick Your Cartela", d: "You can select up to 2 cartelas. The stake is charged per cartela" },
        { t: "Wait for the Countdown", d: "When the timer ends your stake is deducted and the round starts" },
        { t: "Automatic Win", d: "Numbers are marked automatically — a completed line wins for you, no button needed" },
      ];
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
      <div className="bg-gradient-to-br from-bingo-accent/20 to-indigo-600/20 rounded-2xl p-5 border border-bingo-accent/30">
        <h2 className="text-bingo-gold font-bold text-lg mb-2">
          {am ? "እንኳን ወደ ልዩ ቢንጎ በደህና መጡ" : "Welcome to Liyu Bingo"}
        </h2>
        <p className="text-gray-300 text-sm leading-relaxed">
          {am
            ? "ልዩ ቢንጎ ክላሲክ የ75-ኳስ ቢንጎ ጨዋታ ነው። ተጫዋቾች የተጠሩ ቁጥሮችን በካርዳቸው ላይ ምልክት ያደርጋሉ። የማሸነፊያ ንድፍ የሚሞላ የመጀመሪያው ተጫዋች የሽልማት ፑሉን ያሸንፋል!"
            : "Liyu Bingo is a classic 75-ball bingo game where players mark numbers on their cards as they are called. The first player to complete a winning pattern wins the prize pool!"}
        </p>
      </div>

      <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
        <h3 className="text-white font-bold text-base mb-3">{am ? "የጨዋታ መሰረታዊ ነገሮች" : "Game Basics"}</h3>
        <ul className="space-y-3">
          {basics.map((b, i) => (
            <li key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-bingo-accent/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-bingo-accent text-xs font-bold">{i + 1}</span>
              </div>
              <div>
                <p className="text-white text-sm font-medium">{b.t}</p>
                <p className="text-gray-400 text-xs">{b.d}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
        <h3 className="text-white font-bold text-base mb-3">{am ? "የሽልማት ፑል (ደራሽ)" : "Prize Pool (Derash)"}</h3>
        <p className="text-gray-300 text-sm leading-relaxed">
          {am
            ? "ደራሽ = ተጫዋቾች × ውርርድ × 70%። (30% የአገልግሎት ክፍያ ነው።) ደራሹ በጨዋታው ክፍለ ጊዜ በቀጥታ ይሰላል፤ ብዙ አሸናፊዎች ካሉ በእኩል ይከፋፈላል።"
            : "Derash = players x stake x 70% (a 30% service fee applies). It is calculated live during the selection session and split equally between multiple winners."}
        </p>
      </div>
    </motion.div>
  );
}

function HowToPlayTab({ am }: { am: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
      <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
        <h3 className="text-white font-bold text-base mb-3">{am ? "መጀመር" : "Getting Started"}</h3>
        <p className="text-gray-300 text-sm leading-relaxed">
          {am
            ? "ካርቴላ ከመረጡ በኋላ በቀኝ በኩል የመረጡት ካርቴላ ይታያል፤ X በመጫን ማንሳት ይችላሉ። እያንዳንዱ ካርቴላ 24 ቁጥሮች እና በመሃል ነፃ ቦታ አለው። ሂሳብዎ ካልበቃ እንደ ተመልካች (watcher) ጨዋታውን ማየት ይችላሉ።"
            : "After picking a cartela it appears in the side panel — tap X to remove it. Each cartela has 24 numbers plus a FREE center space. If your balance is not enough you still enter the round as a watcher."}
        </p>
      </div>

      <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
        <h3 className="text-white font-bold text-base mb-3">{am ? "ቁጥር መጥራት" : "Number Calling"}</h3>
        <p className="text-gray-300 text-sm leading-relaxed mb-4">
          {am
            ? "በአንድ ዙር 20 ቁጥሮች ብቻ በድምፅ ይጠራሉ (ከ1-75)። እያንዳንዱ ቁጥር የራሱ አምድ አለው፦"
            : "Only 20 numbers are called per round (from 1-75), announced with voice. Each number belongs to a column:"}
        </p>
        <div className="grid grid-cols-5 gap-2 text-center">
          {[
            { letter: "B", range: "1-15", color: "bg-blue-500" },
            { letter: "I", range: "16-30", color: "bg-bingo-accent" },
            { letter: "N", range: "31-45", color: "bg-pink-500" },
            { letter: "G", range: "46-60", color: "bg-bingo-green" },
            { letter: "O", range: "61-75", color: "bg-orange-500" },
          ].map((col) => (
            <div key={col.letter} className="flex flex-col items-center">
              <div className={`w-8 h-8 ${col.color} rounded-lg flex items-center justify-center text-white font-bold text-sm mb-1`}>
                {col.letter}
              </div>
              <span className="text-gray-400 text-[10px]">{col.range}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
        <h3 className="text-white font-bold text-base mb-3">{am ? "ቁጥሮችን ምልክት ማድረግ" : "Marking Numbers"}</h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-bingo-green/20 flex items-center justify-center flex-shrink-0">
              <span className="text-bingo-green text-lg">⚡</span>
            </div>
            <div>
              <p className="text-white text-sm font-medium">{am ? "ሙሉ በራስ-ሰር" : "Fully Automatic"}</p>
              <p className="text-gray-400 text-xs">{am ? "ቁጥሮች ሲጠሩ በራስ-ሰር ምልክት ይደረጋሉ፤ የBINGO ቁልፍ የለም" : "Numbers are marked for you as they are called — there is no BINGO button"}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-bingo-accent/20 flex items-center justify-center flex-shrink-0">
              <span className="text-bingo-accent text-lg">👆</span>
            </div>
            <div>
              <p className="text-white text-sm font-medium">{am ? "ጨዋታውን መልቀቅ" : "Leaving a Round"}</p>
              <p className="text-gray-400 text-xs">{am ? "ወጥተው ቢመለሱም ጨዋታው በጊዜ ላይ ስለሚመሰረት ከተጠሩት ቁጥሮች ጋር ይቀጥላል" : "If you leave and come back, the round is time-based and continues from the current called number"}</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function WinningTab({ am }: { am: boolean }) {
  const patterns = am
    ? [
        { name: "አግድም መስመር", description: "ማንኛውንም ረድፍ ይሙሉ (5 ቁጥሮች በአግድም)", icon: "→", example: "B-1 እስከ O-1" },
        { name: "ቋሚ መስመር", description: "ማንኛውንም አምድ ይሙሉ (5 ቁጥሮች በቁልቁል)", icon: "↓", example: "B-1 እስከ B-15" },
        { name: "ሰያፍ መስመር", description: "ማንኛውንም ሰያፍ ይሙሉ (5 ቁጥሮች)", icon: "↘", example: "ከላይ-ግራ ወደ ታች-ቀኝ ወይም ተቃራኒው" },
      ]
    : [
        { name: "Horizontal Line", description: "Complete any row (5 numbers across)", icon: "→", example: "B-1 to O-1" },
        { name: "Vertical Line", description: "Complete any column (5 numbers down)", icon: "↓", example: "B-1 to B-15" },
        { name: "Diagonal Line", description: "Complete either diagonal (5 numbers)", icon: "↘", example: "Top-left to bottom-right or top-right to bottom-left" },
      ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
      <div className="bg-gradient-to-br from-bingo-gold/20 to-yellow-600/20 rounded-2xl p-5 border border-bingo-gold/30">
        <h3 className="text-bingo-gold font-bold text-lg mb-2">{am ? "እንዴት ማሸነፍ ይቻላል" : "How to Win"}</h3>
        <p className="text-gray-300 text-sm leading-relaxed">
          {am
            ? "ማንኛውንም አግድም፣ ቋሚ ወይም ሰያፍ የ5 ቁጥር መስመር ሲሞላ ስርዓቱ ራሱ ያውቀዋል፤ የማሸነፊያ መስኮት ይታያል እና ደራሹ ወደ ሂሳብዎ ይገባል።"
            : "When any horizontal, vertical or diagonal line of 5 is completed the system detects it automatically, shows the win screen and credits the Derash to your wallet."}
        </p>
      </div>

      <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
        <h3 className="text-white font-bold text-base mb-4">{am ? "የማሸነፊያ ንድፎች" : "Winning Patterns"}</h3>
        <div className="space-y-3">
          {patterns.map((pattern, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-black/20 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-bingo-accent/20 flex items-center justify-center">
                <span className="text-bingo-accent text-xl font-bold">{pattern.icon}</span>
              </div>
              <div className="flex-1">
                <p className="text-white text-sm font-medium">{pattern.name}</p>
                <p className="text-gray-400 text-xs">{pattern.description}</p>
                <p className="text-gray-500 text-[10px] mt-0.5">{pattern.example}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
        <h3 className="text-white font-bold text-base mb-3">{am ? "ብዙ አሸናፊዎች" : "Multiple Winners"}</h3>
        <p className="text-gray-300 text-sm leading-relaxed">
          {am
            ? "ሁለት ወይም ከዚያ በላይ ተጫዋቾች በተመሳሳይ ቁጥር ካሸነፉ ደራሹ በእኩል ይከፋፈላል። በ20 ጥሪ ውስጥ አሸናፊ ካልተገኘ ዙሩ ይጠናቀቃል።"
            : "If two or more players win on the same called number the Derash is split equally. If nobody wins within the 20 calls, the round simply ends."}
        </p>
      </div>

      <div className="bg-bingo-accent/10 rounded-2xl p-5 border border-bingo-accent/30">
        <h3 className="text-bingo-accent font-bold text-sm mb-2">💡 {am ? "የባለሙያ ምክር" : "Pro Tip"}</h3>
        <p className="text-gray-300 text-xs leading-relaxed">
          {am
            ? "በካርድዎ መሃል ላይ ያለው ነፃ ቦታ በራስ-ሰር ምልክት ይደረግበታል እና በሚያልፍ ማንኛውም የማሸነፊያ መስመር ይቆጠራል!"
            : "The FREE space in the center of your card is automatically marked and counts toward any winning line that passes through it!"}
        </p>
      </div>
    </motion.div>
  );
}

function PenaltyTab({ am }: { am: boolean }) {
  const items = am
    ? [
        { i: "💵", t: "ማስገባት (ዲፖዚት)", d: "በቴሌብር ወይም በCBE ገንዘብ ይላኩ፣ ከዚያ የደረሰዎትን SMS ኮፒ አድርገው ይለጥፉ። ዝቅተኛ 50 ብር።" },
        { i: "⚡", t: "ፈጣን ማረጋገጫ", d: "SMS ትክክል ከሆነ ሂሳብዎ ወዲያውኑ ይሞላል፤ ካልሆነ በአስተዳዳሪ ይረጋገጣል።" },
        { i: "🏧", t: "ማውጣት (ዊዝድሮዋል)", d: "ቴሌብር ወይም CBE መርጠው መጠን እና የሂሳብ መረጃ ያስገቡ። ከቀሪ ሂሳብዎ በላይ ማውጣት አይቻልም።" },
        { i: "🎁", t: "የእንኳን ደህና መጡ ጉርሻ", d: "አዲስ ተጠቃሚ ለአንድ ጊዜ ብቻ 10 ብር ጉርሻ ያገኛል።" },
        { i: "👥", t: "የግብዣ ሽልማት", d: "የጋበዙት ሰው ቢያንስ 50 ብር ሲያስገባ 10 ብር ያገኛሉ።" },
      ]
    : [
        { i: "💵", t: "Deposit", d: "Send money via TeleBirr or CBE, then paste the confirmation SMS. Minimum 50 ETB." },
        { i: "⚡", t: "Instant Verification", d: "If the SMS matches, your wallet is credited instantly; otherwise an admin reviews it." },
        { i: "🏧", t: "Withdrawal", d: "Choose TeleBirr or CBE, enter the amount and your account details. You cannot withdraw more than your balance." },
        { i: "🎁", t: "Welcome Bonus", d: "New players receive a one-time 10 ETB bonus." },
        { i: "👥", t: "Referral Reward", d: "Earn 10 ETB when someone you invited deposits at least 50 ETB." },
      ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
      <div className="bg-gradient-to-br from-bingo-green/20 to-emerald-700/20 rounded-2xl p-5 border border-bingo-green/30">
        <h3 className="text-bingo-green font-bold text-lg mb-2">
          💳 {am ? "ክፍያና ጉርሻ" : "Wallet & Bonuses"}
        </h3>
        <p className="text-gray-300 text-sm leading-relaxed">
          {am
            ? "ውርርድ የሚቀነሰው ቆጠራው ሲያልቅ ብቻ ነው። አሸናፊ ሲሆኑ ደራሹ ወዲያውኑ ወደ ዋና ሂሳብዎ ይገባል።"
            : "Your stake is only deducted when the countdown ends. When you win, the Derash is credited to your main balance right away."}
        </p>
      </div>

      <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-black/20 rounded-xl">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <span className="text-base">{it.i}</span>
              </div>
              <div>
                <p className="text-white text-sm font-medium">{it.t}</p>
                <p className="text-gray-400 text-xs">{it.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-bingo-red/10 rounded-2xl p-5 border border-bingo-red/30">
        <h3 className="text-bingo-red font-bold text-sm mb-2">⚠️ {am ? "ፍትሃዊ ጨዋታ" : "Fair Play"}</h3>
        <p className="text-gray-300 text-xs leading-relaxed">
          {am
            ? "የውሸት የክፍያ ማረጋገጫ መላክ ወይም ስርዓቱን ማታለል መለያዎ እንዲታገድ ያደርጋል።"
            : "Sending fake payment proof or abusing the system will get your account banned."}
        </p>
      </div>
    </motion.div>
  );
}

