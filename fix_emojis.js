const fs = require('fs');
const file = 'd:/xampp/htdocs/closevia/client/src/components/ViewTradeModal.tsx';
let content = fs.readFileSync(file, 'utf8');

const lines = content.split('\n');

for (let i = 540; i < 560; i++) {
  if (lines[i] && lines[i].includes('fontSize=') && lines[i].includes('lg') && lines[i].includes('2xl')) {
    lines[i] = '              <Text fontSize={[\'lg\', \'2xl\']}>??</Text>';
  }
  
  if (lines[i] && lines[i].includes('deliveryFee.toFixed(2)')) {
    lines[i] = '              ?{deliveryFee.toFixed(2)}';
  }
}

fs.writeFileSync(file, lines.join('\n'));
console.log('Fixed emojis in ViewTradeModal.tsx');

