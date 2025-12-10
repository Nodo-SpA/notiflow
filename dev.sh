#!/bin/bash

# Script de desarrollo para Notiflow
# Uso: ./dev.sh

set -e

echo "🚀 Iniciando Notiflow en modo desarrollo..."
echo ""

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js no está instalado${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js: $(node --version)${NC}"
echo -e "${GREEN}✓ npm: $(npm --version)${NC}"
echo ""

# Verificar dependencias
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Instalando dependencias...${NC}"
    npm install
    echo ""
fi

# Verificar .env.local
if [ ! -f ".env.local" ]; then
    echo -e "${YELLOW}⚙️  Creando .env.local...${NC}"
    cp .env.example .env.local
    echo -e "${YELLOW}⚠️  Por favor, actualiza .env.local con tus valores${NC}"
    echo ""
fi

# Iniciar servidor de desarrollo
echo -e "${GREEN}📝 Abriendo http://localhost:3000${NC}"
echo -e "${YELLOW}Presiona Ctrl+C para detener el servidor${NC}"
echo ""

npm run dev
