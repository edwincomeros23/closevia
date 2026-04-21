const fs = require('fs');
const file = 'c:/xampp/htdocs/Clovia/client/src/components/ViewTradeModal.tsx';
let f = fs.readFileSync(file, 'utf8');
f = f.replace(/Trade Completed Successfully![^\n]*\n/g, 'Trade Completed Successfully! 🎉\n');
f = f.replace(/Your review has been submitted[^\n]*\n/g, 'Your review has been submitted ✅\n');
// For the icons we can match delivery options section
f = f.replace(/icon: '=[^\n]*',/g, "icon: '🚚',");
f = f.replace(/icon: 'G[^\n]*',/g, "icon: '⚡',");
fs.writeFileSync(file, f);
console.log('Fixed file.');
