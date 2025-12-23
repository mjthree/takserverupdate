#!/bin/bash
# Build ATAK update files (product.inf and product.infz)
# Usage: ./build-update.sh [folder_path]

set -e

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed or not in PATH"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Get the folder path (default to current directory)
FOLDER="${1:-$PWD}"

# Check if folder exists
if [ ! -d "$FOLDER" ]; then
    echo "ERROR: Folder does not exist: $FOLDER"
    exit 1
fi

# Check if node_modules exists, if not run npm install
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "Installing dependencies..."
    cd "$SCRIPT_DIR"
    npm install
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to install dependencies"
        exit 1
    fi
fi

# Run the build script
echo ""
echo "Building update files for folder: $FOLDER"
echo ""
node "$SCRIPT_DIR/build-update.js" "$FOLDER"

if [ $? -ne 0 ]; then
    echo ""
    echo "ERROR: Build failed"
    exit 1
fi

echo ""
echo "Done!"

