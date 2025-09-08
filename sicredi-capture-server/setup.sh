#!/bin/bash

echo "🚀 ===== SETUP SICREDI DASHBOARD CAPTURE ====="
echo ""

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado!"
    echo "📥 Instale Node.js 18+ em: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js versão $NODE_VERSION encontrada"
    echo "📥 É necessário Node.js 18+ em: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js $(node -v) encontrado"

# Verificar se estamos na pasta correta
if [ ! -f "package.json" ]; then
    echo "❌ Execute este script na pasta sicredi-capture-server/"
    echo "📁 Estrutura esperada:"
    echo "   new_report_sicredi/"
    echo "   ├── main.html"
    echo "   └── sicredi-capture-server/ ← Execute aqui"
    echo "       ├── package.json"
    echo "       └── setup.sh"
    exit 1
fi

echo "✅ Pasta correta identificada"

# Instalar dependências
echo ""
echo "📦 Instalando dependências..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Erro ao instalar dependências"
    exit 1
fi

echo "✅ Dependências instaladas com sucesso"

# Verificar se main.html existe
MAIN_HTML="../main.html"
if [ ! -f "$MAIN_HTML" ]; then
    echo ""
    echo "⚠️  AVISO: main.html não encontrado na pasta raiz"
    echo "📁 Certifique-se de que a estrutura está correta:"
    echo "   new_report_sicredi/"
    echo "   ├── main.html ← Necessário"
    echo "   └── sicredi-capture-server/"
    echo ""
fi

# Verificar se pages-config.json existe
PAGES_CONFIG="../pages-config.json"
if [ ! -f "$PAGES_CONFIG" ]; then
    echo "⚠️  AVISO: pages-config.json não encontrado na pasta raiz"
fi

echo ""
echo "🎉 ===== SETUP CONCLUÍDO ====="
echo ""
echo "📋 PRÓXIMOS PASSOS:"
echo "   1. npm run login     # Fazer login no Google"
echo "   2. npm run status    # Verificar status"
echo "   3. npm start         # Iniciar servidor"
echo "   4. Acessar: http://localhost:3001"
echo ""
echo "🔧 COMANDOS ÚTEIS:"
echo "   npm run dev          # Modo desenvolvimento"
echo "   npm run test         # Testar captura"
echo "   npm run health       # Status do servidor"
echo "   npm run clean        # Limpar cache"
echo ""
echo "📖 Mais informações: README.md"
echo "=============================================="