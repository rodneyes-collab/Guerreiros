const fs = require('fs');
let code = fs.readFileSync('components/AttendanceView.tsx', 'utf-8');

const target = `                             <p className={\`text-[12px] font-black uppercase leading-none tracking-tighter flex items-center flex-wrap gap-1 \${player.isOfficialSetter ? 'text-brand-primary' : 'text-white'}\`}>
                               {capitalizeName(displayName)}
                               {player.checkInMethod === 'NFC' && (
                                 <span className="text-[7px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-1 rounded flex items-center font-bold tracking-widest" title="Check-in via Tag NFC">NFC</span>
                               )}
                               {player.checkInMethod === 'QR' && (
                                 <span className="text-[7px] bg-blue-500/20 text-blue-400 border border-blue-500/40 px-1 rounded flex items-center font-bold tracking-widest" title="Check-in via QR Code">QR CODE</span>
                               )}
                               {(!player.checkInMethod || player.checkInMethod === 'MANUAL') && (
                                 <span className="text-[7px] bg-white/5 text-white/30 border border-white/10 px-1 rounded flex items-center font-bold tracking-widest" title="Check-in Manual">MANUAL</span>
                               )}
                             </p>`;

const replacement = `                             <p className={\`text-[12px] font-black uppercase leading-none tracking-tighter flex items-center flex-wrap gap-1 \${player.isOfficialSetter ? 'text-brand-primary' : 'text-white'}\`}>
                               {capitalizeName(displayName)}
                               {player.checkInMethod === 'NFC' && (
                                 <span className="text-[7px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-1.5 py-0.5 rounded flex items-center gap-1 font-bold tracking-widest" title="Check-in via Tag NFC">
                                   <SmartphoneNfc className="w-2.5 h-2.5" /> NFC
                                 </span>
                               )}
                               {player.checkInMethod === 'QR' && (
                                 <span className="text-[7px] bg-blue-500/20 text-blue-400 border border-blue-500/40 px-1.5 py-0.5 rounded flex items-center gap-1 font-bold tracking-widest" title="Check-in via QR Code">
                                   <QrCode className="w-2.5 h-2.5" /> QR
                                 </span>
                               )}
                               {(!player.checkInMethod || player.checkInMethod === 'MANUAL') && (
                                 <span className="text-[7px] bg-white/5 text-white/30 border border-white/10 px-1.5 py-0.5 rounded flex items-center gap-1 font-bold tracking-widest" title="Check-in Manual">
                                   <UserCheck className="w-2.5 h-2.5 opacity-70" /> MANUAL
                                 </span>
                               )}
                             </p>`;

code = code.replace(target, replacement);
fs.writeFileSync('components/AttendanceView.tsx', code);
console.log('updated AttendanceView');
