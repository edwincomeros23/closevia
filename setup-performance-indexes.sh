#!/bin/bash
# Performance Fix Setup Script
# Applies database indexes and optimizations

set -e

echo "🔧 Clovia Performance Optimization Setup"
echo "========================================"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if MySQL is available
if ! command -v mysql &> /dev/null; then
    echo -e "${RED}❌ MySQL client not found. Please install it first.${NC}"
    exit 1
fi

# Get database credentials
read -p "Enter MySQL host (default: 127.0.0.1): " MYSQL_HOST
MYSQL_HOST=${MYSQL_HOST:-127.0.0.1}

read -p "Enter MySQL username (default: root): " MYSQL_USER
MYSQL_USER=${MYSQL_USER:-root}

read -sp "Enter MySQL password: " MYSQL_PASSWORD
echo

read -p "Enter database name (default: defaultdb): " MYSQL_DB
MYSQL_DB=${MYSQL_DB:-defaultdb}

# Test connection
echo -e "\n${YELLOW}Testing database connection...${NC}"
if ! mysql -h "$MYSQL_HOST" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" -e "SELECT 1;" &> /dev/null; then
    echo -e "${RED}❌ Failed to connect to MySQL. Please check your credentials.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Connection successful${NC}"

# Apply migration
echo -e "\n${YELLOW}Applying performance indexes migration...${NC}"
mysql -h "$MYSQL_HOST" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DB" <<EOF
-- Add index on email for fast user lookups during registration
ALTER TABLE users ADD INDEX IF NOT EXISTS idx_users_email (email);

-- Add index on slug for slug uniqueness checks during registration
ALTER TABLE users ADD INDEX IF NOT EXISTS idx_users_slug (slug);

-- Add index on verified status for filtering verified/unverified users
ALTER TABLE users ADD INDEX IF NOT EXISTS idx_users_verified (verified);

-- Add index on email_otp_hash for fast OTP lookups
ALTER TABLE users ADD INDEX IF NOT EXISTS idx_users_email_otp_hash (email_otp_hash);

-- Add composite index for common queries
ALTER TABLE users ADD INDEX IF NOT EXISTS idx_users_email_verified (email, verified);
EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Indexes created successfully${NC}"
else
    echo -e "${RED}❌ Failed to create indexes${NC}"
    exit 1
fi

# Verify indexes
echo -e "\n${YELLOW}Verifying indexes...${NC}"
mysql -h "$MYSQL_HOST" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DB" <<EOF
SHOW INDEXES FROM users WHERE Key_name IN ('idx_users_email', 'idx_users_slug', 'idx_users_verified', 'idx_users_email_otp_hash', 'idx_users_email_verified');
EOF

echo -e "\n${GREEN}✅ Setup complete!${NC}"
echo
echo "Next steps:"
echo "1. Rebuild the Go application: go build -o clovia main.go"
echo "2. Restart the backend server"
echo "3. Run the performance test again:"
echo "   k6 run -u 1 -d 2m clovia-performance-test.js"
