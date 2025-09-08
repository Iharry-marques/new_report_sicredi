// reset.js - Script para limpar dados e cache do sistema
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Arquivos e pastas para limpar
const ITEMS_TO_CLEAN = [
  'cookies.json',
  '.cache',
  'chrome-profile',
  'test_*.png', // Imagens de teste
];

// Chaves do localStorage que o frontend usa
const LOCALSTORAGE_KEYS = [
  'sicredi_pages_v2',
  'sicredi_comments_v2', 
  'sicredi_status_v2',
  'sicredi_shots_v1',
  'sicredi_report_v3_analise',
  'sicredi_report_v3_criticos',
  'sicredi_templates_v3'
];

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

async function askQuestion(question) {
  const rl = createInterface();
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase());
    });
  });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function removeFile(filePath) {
  try {
    const exists = await fileExists(filePath);
    if (exists) {
      await fs.unlink(filePath);
      console.log(`✅ Removido: ${filePath}`);
      return true;
    } else {
      console.log(`⏭️  Não encontrado: ${filePath}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Erro ao remover ${filePath}:`, error.message);
    return false;
  }
}

async function removeDirectory(dirPath) {
  try {
    const exists = await fileExists(dirPath);
    if (exists) {
      await fs.rm(dirPath, { recursive: true, force: true });
      console.log(`✅ Removido diretório: ${dirPath}`);
      return true;
    } else {
      console.log(`⏭️  Diretório não encontrado: ${dirPath}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Erro ao remover diretório ${dirPath}:`, error.message);
    return false;
  }
}

async function removeTestImages() {
  try {
    const files = await fs.readdir(__dirname);
    const testImages = files.filter(file => file.startsWith('test_') && file.endsWith('.png'));
    
    let removed = 0;
    for (const file of testImages) {
      const filePath = path.join(__dirname, file);
      const success = await removeFile(filePath);
      if (success) removed++;
    }
    
    if (removed > 0) {
      console.log(`✅ Removidas ${removed} imagens de teste`);
    }
    
    return removed;
  } catch (error) {
    console.log(`❌ Erro ao remover imagens de teste:`, error.message);
    return 0;
  }
}

async function cleanServerData() {
  console.log('\n🧹 Limpando dados do servidor...');
  
  let cleaned = 0;
  
  // Remover cookies
  if (await removeFile(path.join(__dirname, 'cookies.json'))) {
    cleaned++;
  }
  
  // Remover cache
  if (await removeDirectory(path.join(__dirname, '.cache'))) {
    cleaned++;
  }
  
  // Remover perfil do Chrome
  if (await removeDirectory(path.join(__dirname, 'chrome-profile'))) {
    cleaned++;
  }
  
  // Remover imagens de teste
  const imagesRemoved = await removeTestImages();
  if (imagesRemoved > 0) cleaned++;
  
  console.log(`\n📊 ${cleaned} categorias de dados removidas`);
  return cleaned > 0;
}

async function showLocalStorageInstructions() {
  console.log('\n💾 Para limpar dados do navegador (LocalStorage):');
  console.log('   1. Abra http://localhost:3001 no navegador');
  console.log('   2. Pressione F12 (DevTools)');
  console.log('   3. Vá para a aba "Application" ou "Storage"');
  console.log('   4. Clique em "Local Storage" > "localhost:3001"');
  console.log('   5. Delete as chaves que começam com "sicredi_"');
  console.log('\n   Ou execute este comando no Console do navegador:');
  console.log(`   Object.keys(localStorage).filter(k => ['${LOCALSTORAGE_KEYS.join("','")}'.includes(k)].forEach(k => localStorage.removeItem(k))`);
}

async function resetComplete() {
  console.log('\n🔄 ===== RESET COMPLETO DO SISTEMA =====');
  
  const answer = await askQuestion('⚠️  Isso vai limpar TODOS os dados (cookies, cache, comentários). Continuar? (y/N): ');
  
  if (answer !== 'y' && answer !== 'yes') {
    console.log('❌ Reset cancelado pelo usuário');
    return;
  }
  
  console.log('\n🗑️  Iniciando limpeza...');
  
  const serverCleaned = await cleanServerData();
  
  if (serverCleaned) {
    console.log('\n✅ Dados do servidor limpos com sucesso!');
  } else {
    console.log('\n⚠️  Nenhum dado do servidor foi encontrado para limpar');
  }
  
  showLocalStorageInstructions();
  
  console.log('\n🔄 Após a limpeza, será necessário:');
  console.log('   1. npm run login     # Fazer login novamente');
  console.log('   2. npm start         # Iniciar o servidor');
  console.log('   3. Preencher análises e comentários novamente');
  
  console.log('\n✅ Reset concluído!');
}

async function resetCookiesOnly() {
  console.log('\n🍪 ===== RESET APENAS DOS COOKIES =====');
  
  const answer = await askQuestion('Isso vai remover apenas os cookies de autenticação. Continuar? (y/N): ');
  
  if (answer !== 'y' && answer !== 'yes') {
    console.log('❌ Reset cancelado');
    return;
  }
  
  const removed = await removeFile(path.join(__dirname, 'cookies.json'));
  
  if (removed) {
    console.log('\n✅ Cookies removidos!');
    console.log('💡 Execute: npm run login (para fazer login novamente)');
  } else {
    console.log('\n⚠️  Arquivo de cookies não encontrado');
  }
}

async function resetCacheOnly() {
  console.log('\n💽 ===== RESET APENAS DO CACHE =====');
  
  const answer = await askQuestion('Isso vai limpar cache e perfil do navegador. Continuar? (y/N): ');
  
  if (answer !== 'y' && answer !== 'yes') {
    console.log('❌ Reset cancelado');
    return;
  }
  
  let cleaned = 0;
  
  if (await removeDirectory(path.join(__dirname, '.cache'))) {
    cleaned++;
  }
  
  if (await removeDirectory(path.join(__dirname, 'chrome-profile'))) {
    cleaned++;
  }
  
  if (cleaned > 0) {
    console.log('\n✅ Cache limpo!');
    console.log('💡 O navegador criará novos arquivos na próxima execução');
  } else {
    console.log('\n⚠️  Nenhum cache encontrado para limpar');
  }
}

async function showMenu() {
  console.log('\n🔄 ===== MENU DE RESET - SICREDI =====');
  console.log('1. Reset completo (tudo)');
  console.log('2. Reset apenas cookies');
  console.log('3. Reset apenas cache');
  console.log('4. Mostrar instruções de LocalStorage');
  console.log('5. Sair');
  
  const choice = await askQuestion('\nEscolha uma opção (1-5): ');
  
  switch (choice) {
    case '1':
      await resetComplete();
      break;
    case '2':
      await resetCookiesOnly();
      break;
    case '3':
      await resetCacheOnly();
      break;
    case '4':
      showLocalStorageInstructions();
      break;
    case '5':
      console.log('👋 Saindo...');
      return;
    default:
      console.log('❌ Opção inválida');
      await showMenu();
  }
}

// Detectar se foi chamado diretamente ou com argumentos
const args = process.argv.slice(2);

if (import.meta.url === `file://${process.argv[1]}`) {
  if (args.includes('--cookies')) {
    resetCookiesOnly();
  } else if (args.includes('--cache')) {
    resetCacheOnly();
  } else if (args.includes('--all')) {
    resetComplete();
  } else if (args.includes('--help')) {
    console.log('\n🔄 Script de Reset do Sistema Sicredi');
    console.log('\nUso:');
    console.log('  node reset.js          # Menu interativo');
    console.log('  node reset.js --all    # Reset completo');
    console.log('  node reset.js --cookies # Apenas cookies');
    console.log('  node reset.js --cache  # Apenas cache');
    console.log('  node reset.js --help   # Esta ajuda');
  } else {
    showMenu();
  }
}