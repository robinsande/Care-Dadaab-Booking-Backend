#!/bin/bash

# Database Seeding Script
# This script sets up the database with initial test data and default users

echo "========================================="
echo "CARE Accommodation Management System"
echo "Database Seeding Script"
echo "========================================="
echo ""

# Check if .env.seed exists
if [ ! -f .env.seed ]; then
    echo "❌ Error: .env.seed file not found!"
    echo "Please create .env.seed file with your configuration"
    exit 1
fi

# Load environment variables from .env.seed
export $(cat .env.seed | grep -v '#' | xargs)

echo "📋 Configuration loaded from .env.seed"
echo ""
echo "Database Details:"
echo "  MongoDB URI: ${MONGODB_URI:0:50}..."
echo "  Super Admin Email: $SEED_SUPER_ADMIN_EMAIL"
echo "  Officer Email: $SEED_OFFICER_EMAIL"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Run the seed script
echo "🌱 Starting database seed..."
echo ""

npm run seed

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================="
    echo "✅ Database seeding completed successfully!"
    echo "========================================="
    echo ""
    echo "🔐 Login Credentials:"
    echo "  Super Admin: $SEED_SUPER_ADMIN_EMAIL / $SEED_PASSWORD"
    echo "  Officer: $SEED_OFFICER_EMAIL / $SEED_PASSWORD"
    echo ""
    echo "🌐 Backend URL:"
    echo "  https://care-dadaab-booking-backend.onrender.com/api/v1"
    echo ""
    echo "⚠️  Important: Change these default passwords in production!"
    echo "========================================="
else
    echo ""
    echo "❌ Database seeding failed!"
    echo "Please check the error messages above."
    exit 1
fi
