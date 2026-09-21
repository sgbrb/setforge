// generate-client.js
const { execSync } = require('child_process');
try {
  console.log('Gerando Prisma Client...');
  execSync('npx prisma generate', { stdio: 'inherit' });
} catch (e) {
  console.error('Erro ao gerar:', e.message);
}