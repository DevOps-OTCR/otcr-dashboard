#!/bin/bash

# ============================================================================
# OTCR Dashboard - Production Deployment Script
# ============================================================================
# This script helps automate the production deployment process
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}OTCR Dashboard Deployment${NC}"
echo -e "${GREEN}================================${NC}"
echo ""

# Check if .env.production exists
if [ ! -f "../.env.production" ]; then
    echo -e "${RED}Error: .env.production file not found!${NC}"
    echo "Please create .env.production with your production configuration."
    exit 1
fi

# Load environment variables
source ../.env.production

echo -e "${YELLOW}Step 1: Checking prerequisites...${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites met${NC}"
echo ""

echo -e "${YELLOW}Step 2: Building Docker images...${NC}"
docker-compose -f ../docker-compose.prod.yml build

echo -e "${GREEN}✓ Images built successfully${NC}"
echo ""

echo -e "${YELLOW}Step 3: Running database migrations...${NC}"
cd ../backend
npm run prisma:migrate
npm run prisma:generate

echo -e "${GREEN}✓ Database ready${NC}"
echo ""

echo -e "${YELLOW}Step 4: Starting services...${NC}"
cd ..
docker-compose -f docker-compose.prod.yml up -d

echo -e "${GREEN}✓ Services started${NC}"
echo ""

echo -e "${YELLOW}Step 5: Waiting for services to be healthy...${NC}"
sleep 10

# Check if services are running
if docker-compose -f docker-compose.prod.yml ps | grep -q "Up"; then
    echo -e "${GREEN}✓ Services are running${NC}"
else
    echo -e "${RED}✗ Some services failed to start${NC}"
    docker-compose -f docker-compose.prod.yml logs
    exit 1
fi

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Deployment Successful!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "Your OTCR Dashboard is now running:"
echo -e "  Frontend: ${GREEN}http://localhost:3000${NC}"
echo -e "  Backend:  ${GREEN}http://localhost:4000${NC}"
echo -e "  Database: ${GREEN}PostgreSQL on port 5432${NC}"
echo -e "  Redis:    ${GREEN}Redis on port 6379${NC}"
echo ""
echo "To view logs: docker-compose -f docker-compose.prod.yml logs -f"
echo "To stop:      docker-compose -f docker-compose.prod.yml down"
echo ""
