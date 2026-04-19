const fs = require('fs');
const file = 'c:/xampp/htdocs/Clovia/client/src/components/ViewTradeModal.tsx';
let f = fs.readFileSync(file, 'utf8');

f = f.replace(/G[^\w\s]* Your Selection Locked/g, '✅ Your Selection Locked');
f = f.replace(/G[^\w\s]* Waiting for Agreement/g, '⏳ Waiting for Agreement');
f = f.replace(/G[^\w\s]* Review \(after agreement\)/g, '⭐ Review (after agreement)');
f = f.replace(/G[^\w\s]* Waiting for Meetup Completion/g, '⏳ Waiting for Meetup Completion');

fs.writeFileSync(file, f);
console.log('Fixed ViewTradeModal.tsx');
