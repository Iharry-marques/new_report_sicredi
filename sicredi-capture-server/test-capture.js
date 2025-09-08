// test-capture.js - Script para testar captura de dashboards
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:3001';

// URLs de teste dos dashboards
const TEST_DASHBOARDS = [
  {
    name: "SICREDI CAS",
    url: "https://lookerstudio.google.com/embed/reporting/475a3c3e-e6f6-4341-a5d2-c493f486d380/page/p_i6m9xrzjtd",
    width: 600,
    height: 1050
  },
  {
    name: "SICREDI PR/SP/RJ",
    url: "https://lookerstudio.google.com/embed/reporting/e747cd62-1085-43f8-8d4a-4d993140c8b1/page/p_hp7fdemgvd",
    width: 600,
    height: 1550
  }
];

async function testServerHealth() {
  console.log('🔍 Testando saúde do servidor...');
  
  try {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();
    
    if (data.ok) {
      console.log('✅ Servidor funcionando');
      console.log(`   Serviço: ${data.service}`);
      console.log(`   Timestamp: ${data.timestamp}`);
      return true;
    } else {
      console.log('❌ Servidor retornou erro');
      return false;
    }
  } catch (error) {
    console.log('❌ Erro de conexão:', error.message);
    console.log('💡 Certifique-se de que o servidor está rodando: npm start');
    return false;
  }
}

async function testCookieStatus() {
  console.log('\n🍪 Verificando status dos cookies...');
  
  try {
    const response = await fetch(`${BASE_URL}/status`);
    const data = await response.json();
    
    console.log(`   Autenticado: ${data.authenticated ? '✅' : '❌'}`);
    console.log(`   Total de cookies: ${data.totalCookies || 0}`);
    console.log(`   Cookies válidos: ${data.validCookies || 0}`);
    console.log(`   Status: ${data.status}`);
    
    if (!data.authenticated) {
      console.log('💡 Execute: npm run login');
    }
    
    return data.authenticated;
  } catch (error) {
    console.log('❌ Erro ao verificar cookies:', error.message);
    return false;
  }
}

async function testConnection(url) {
  console.log(`\n🔗 Testando conexão: ${url}`);
  
  try {
    const testUrl = `${BASE_URL}/test-connection?url=${encodeURIComponent(url)}`;
    const response = await fetch(testUrl);
    const data = await response.json();
    
    if (data.ok) {
      console.log('✅ Conexão bem-sucedida');
      console.log(`   Título: ${data.title.slice(0, 50)}...`);
      console.log(`   Status HTTP: ${data.status}`);
      return true;
    } else {
      console.log('❌ Falha na conexão:', data.error);
      return false;
    }
  } catch (error) {
    console.log('❌ Erro de rede:', error.message);
    return false;
  }
}

async function testCapture(dashboard) {
  console.log(`\n📸 Testando captura: ${dashboard.name}`);
  
  try {
    const captureUrl = `${BASE_URL}/capture?url=${encodeURIComponent(dashboard.url)}&w=${dashboard.width}&h=${dashboard.height}`;
    
    console.log('   Enviando requisição...');
    const response = await fetch(captureUrl, {
      timeout: 60000 // 60 segundos
    });
    
    const data = await response.json();
    
    if (data.ok && data.dataUrl) {
      console.log('✅ Captura bem-sucedida');
      console.log(`   Dimensões: ${data.dimensions.width}x${data.dimensions.height}`);
      console.log(`   Tamanho do arquivo: ${Math.round(data.dataUrl.length / 1024)}KB`);
      
      // Salvar imagem de teste (opcional)
      const imageData = data.dataUrl.replace(/^data:image\/png;base64,/, '');
      const filename = `test_${dashboard.name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.png`;
      await fs.writeFile(filename, imageData, 'base64');
      console.log(`   Imagem salva: ${filename}`);
      
      return true;
    } else {
      console.log('❌ Falha na captura:', data.error || 'Erro desconhecido');
      if (data.needsLogin) {
        console.log('💡 Execute: npm run login');
      }
      return false;
    }
  } catch (error) {
    console.log('❌ Erro durante captura:', error.message);
    
    if (error.message.includes('timeout')) {
      console.log('💡 Timeout - dashboard pode estar lento para carregar');
    }
    
    return false;
  }
}

async function runAllTests() {
  console.log('🧪 ===== TESTE COMPLETO DO SISTEMA SICREDI =====\n');
  
  let results = {
    serverHealth: false,
    cookieStatus: false,
    connections: 0,
    captures: 0,
    total: TEST_DASHBOARDS.length
  };
  
  // Teste 1: Saúde do servidor
  results.serverHealth = await testServerHealth();
  if (!results.serverHealth) {
    console.log('\n❌ Teste interrompido - servidor não está funcionando');
    return results;
  }
  
  // Teste 2: Status dos cookies
  results.cookieStatus = await testCookieStatus();
  
  // Teste 3: Conexões (mesmo sem autenticação)
  console.log('\n🔗 Testando conexões...');
  for (const dashboard of TEST_DASHBOARDS) {
    const success = await testConnection(dashboard.url);
    if (success) results.connections++;
  }
  
  // Teste 4: Capturas (só se autenticado)
  if (results.cookieStatus) {
    console.log('\n📸 Testando capturas...');
    for (const dashboard of TEST_DASHBOARDS) {
      const success = await testCapture(dashboard);
      if (success) results.captures++;
    }
  } else {
    console.log('\n⏭️  Pulando testes de captura (não autenticado)');
  }
  
  return results;
}

async function printSummary(results) {
  console.log('\n📊 ===== RESUMO DOS TESTES =====');
  console.log(`🏥 Servidor: ${results.serverHealth ? '✅' : '❌'}`);
  console.log(`🍪 Cookies: ${results.cookieStatus ? '✅' : '❌'}`);
  console.log(`🔗 Conexões: ${results.connections}/${results.total} ${results.connections === results.total ? '✅' : '⚠️'}`);
  console.log(`📸 Capturas: ${results.captures}/${results.total} ${results.captures === results.total ? '✅' : '⚠️'}`);
  
  console.log('\n💡 PRÓXIMOS PASSOS:');
  
  if (!results.serverHealth) {
    console.log('   1. Execute: npm start (na pasta sicredi-capture-server)');
  } else if (!results.cookieStatus) {
    console.log('   1. Execute: npm run login');
    console.log('   2. Faça login no navegador que abrir');
    console.log('   3. Execute este teste novamente');
  } else if (results.captures < results.total) {
    console.log('   1. Verifique as URLs dos dashboards');
    console.log('   2. Verifique se tem acesso aos dashboards');
    console.log('   3. Tente executar: npm run login (renovar cookies)');
  } else {
    console.log('   ✅ Sistema funcionando perfeitamente!');
    console.log('   🚀 Acesse: http://localhost:3001');
  }
  
  console.log('\n🔧 COMANDOS ÚTEIS:');
  console.log('   npm run status   # Verificar status');
  console.log('   npm run health   # Verificar servidor');
  console.log('   npm run login    # Renovar login');
  console.log('   npm start        # Iniciar servidor');
  console.log('==========================================');
}

// Executar testes se este arquivo for chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests()
    .then(printSummary)
    .catch(console.error);
}

export { runAllTests, testServerHealth, testCookieStatus, testCapture };